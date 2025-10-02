#!/usr/bin/env node

/**
 * delta-sessions - Command-based session management CLI (v1.5)
 */

import * as path from 'node:path';
import { SessionManager } from './sessions/manager.js';
import type {
  StartResult,
  ExecResult,
  EndResult,
  ListSessionInfo,
} from './sessions/types.js';

/**
 * Read input from stdin
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
delta-sessions - Command-based session management

USAGE:
  delta-sessions <command> [options]

COMMANDS:
  start [shell]              Create a new session (default: bash)
  exec <session_id>          Execute command in session (from stdin)
  end <session_id>           Terminate a session
  list                       List all sessions
  cleanup                    Remove terminated sessions

GLOBAL OPTIONS:
  --sessions-dir <path>     Session storage directory (default: $CWD/.sessions)
  --help                    Show this help message
  --version                 Show version

EXAMPLES:
  # Create a bash session
  delta-sessions start

  # Execute a command
  echo "ls -la" | delta-sessions exec sess_abc123

  # Execute with heredoc
  delta-sessions exec sess_abc123 << 'EOF'
  cd /tmp
  pwd
  ls -la
  EOF

  # List all sessions
  delta-sessions list

  # Terminate session
  delta-sessions end sess_abc123

  # Cleanup dead sessions
  delta-sessions cleanup

COMPARISON WITH PTY VERSION:
  PTY (delta-sessions-pty): Real-time terminal interaction (experimental)
  This (delta-sessions):    Command-based execution (production-ready)

  Use this version unless you specifically need PTY features (vim, top, etc.).
`);
}

/**
 * Print version
 */
function printVersion(): void {
  console.log('delta-sessions v1.5.0 (simplified)');
}

/**
 * Handle start command
 */
async function handleStart(manager: SessionManager, args: string[]): Promise<StartResult> {
  const command = args.length > 0 ? args[0] : 'bash';
  const sessionId = await manager.createSession(command);
  const session = await manager.getSession(sessionId);

  if (!session) {
    throw new Error('Failed to create session');
  }

  return {
    session_id: session.session_id,
    command: session.command,
    work_dir: session.work_dir,
    status: 'active',
  };
}

/**
 * Handle exec command
 */
async function handleExec(manager: SessionManager, args: string[]): Promise<ExecResult> {
  if (args.length === 0) {
    throw new Error('Usage: delta-sessions exec <session_id> < command');
  }

  const sessionId = args[0]!; // Already validated above

  // Read command from stdin
  const command = await readStdin();

  if (!command.trim()) {
    throw new Error('No command provided (stdin is empty)');
  }

  const result = await manager.executeCommand(sessionId, command);
  return result;
}

/**
 * Handle end command
 */
async function handleEnd(manager: SessionManager, args: string[]): Promise<EndResult> {
  if (args.length === 0) {
    throw new Error('Usage: delta-sessions end <session_id>');
  }

  const sessionId = args[0]!; // Already validated above
  await manager.terminateSession(sessionId);

  return {
    status: 'terminated',
    session_id: sessionId,
  };
}

/**
 * Handle list command
 */
async function handleList(manager: SessionManager): Promise<ListSessionInfo[]> {
  return await manager.listSessions();
}

/**
 * Handle cleanup command
 */
async function handleCleanup(manager: SessionManager): Promise<{ cleaned: string[] }> {
  const cleaned = await manager.cleanup();
  return { cleaned };
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Global options
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    printVersion();
    process.exit(0);
  }

  // Parse --sessions-dir option
  let sessionsDir = path.join(process.cwd(), '.sessions');
  const sessionsDirIndex = args.findIndex((arg) => arg === '--sessions-dir');
  if (sessionsDirIndex !== -1) {
    const dirArg = args[sessionsDirIndex + 1];
    if (!dirArg) {
      throw new Error('--sessions-dir requires a path argument');
    }
    sessionsDir = path.resolve(dirArg);
    // Remove --sessions-dir and its value from args
    args.splice(sessionsDirIndex, 2);
  }

  // Create manager
  const manager = new SessionManager({ sessions_dir: sessionsDir });

  // Parse command
  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    let result: unknown;

    switch (command) {
      case 'start':
        result = await handleStart(manager, commandArgs);
        break;

      case 'exec':
        result = await handleExec(manager, commandArgs);
        // For exec, output stdout directly (not JSON) for better UX
        // JSON structure is returned for programmatic use
        if (typeof result === 'object' && result !== null && 'stdout' in result) {
          const execResult = result as ExecResult;
          // Print stdout to stdout
          if (execResult.stdout) {
            process.stdout.write(execResult.stdout);
          }
          // Print stderr to stderr
          if (execResult.stderr) {
            process.stderr.write(execResult.stderr);
          }
          // Exit with command's exit code
          process.exit(execResult.exit_code);
        }
        break;

      case 'end':
        result = await handleEnd(manager, commandArgs);
        break;

      case 'list':
        result = await handleList(manager);
        break;

      case 'cleanup':
        result = await handleCleanup(manager);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "delta-sessions --help" for usage information');
        process.exit(1);
    }

    // Output JSON result (except for exec, handled above)
    if (command !== 'exec') {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
