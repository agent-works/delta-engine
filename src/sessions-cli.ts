#!/usr/bin/env node

import * as path from 'node:path';
import { SessionManager } from './sessions/manager.js';
import { parseEscapeSequences } from './sessions/escape-parser.js';
import { getKeyCode, isValidKey } from './sessions/key-codes.js';
import type {
  StartResult,
  WriteResult,
  WriteKeyResult,
  EndResult,
  StatusResult,
  CleanupResult,
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
delta-sessions - Manage interactive process sessions

USAGE:
  delta-sessions <command> [options]

COMMANDS:
  start <command> [args...]        Start a new session
  write <session_id>               Send input to session (from stdin)
  write-key <session_id> <key>     Send control key to session
  read <session_id> [options]      Read output from session
  end <session_id>                 Terminate a session
  list                             List all sessions
  status <session_id>              Check session status
  cleanup                          Remove dead sessions

READ OPTIONS:
  --timeout <ms>     Wait N milliseconds before returning (default: 0)
  --wait             Block until output available
  --follow           Stream output continuously
  --lines <N>        Return only last N lines

GLOBAL OPTIONS:
  --sessions-dir <path>   Session storage directory (default: $CWD/.sessions)
  --help                  Show this help message
  --version               Show version

EXAMPLES:
  # Start a bash shell
  delta-sessions start bash -i

  # Send a command
  echo "ls -la\\n" | delta-sessions write sess_abc123

  # Send arrow key
  delta-sessions write-key sess_abc123 arrow_down

  # Read with timeout
  delta-sessions read sess_abc123 --timeout 2000

  # List all sessions
  delta-sessions list

  # Clean up dead sessions
  delta-sessions cleanup
`);
}

/**
 * Print version
 */
function printVersion(): void {
  // TODO: Get version from package.json
  console.log('delta-sessions v1.4.2');
}

/**
 * Handle start command
 */
async function handleStart(manager: SessionManager, args: string[]): Promise<StartResult> {
  if (args.length === 0) {
    throw new Error('Usage: delta-sessions start <command> [args...]');
  }

  const sessionId = await manager.createSession(args);
  const session = await manager.getSession(sessionId);

  if (!session) {
    throw new Error('Failed to create session');
  }

  const metadata = session.getMetadata();

  return {
    session_id: sessionId,
    status: 'running',
    pid: metadata.pid,
    command: metadata.command,
  };
}

/**
 * Handle write command
 */
async function handleWrite(manager: SessionManager, sessionId: string): Promise<WriteResult> {
  if (!sessionId) {
    throw new Error('Usage: delta-sessions write <session_id>');
  }

  const session = await manager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or dead`);
  }

  const rawInput = await readStdin();
  const processedInput = parseEscapeSequences(rawInput);

  await session.write(processedInput);

  return {
    status: 'sent',
    bytes: processedInput.length,
    session_id: sessionId,
  };
}

/**
 * Handle write-key command
 */
async function handleWriteKey(
  manager: SessionManager,
  sessionId: string,
  keyName: string
): Promise<WriteKeyResult> {
  if (!sessionId || !keyName) {
    throw new Error('Usage: delta-sessions write-key <session_id> <key_name>');
  }

  if (!isValidKey(keyName)) {
    throw new Error(`Invalid key name: ${keyName}`);
  }

  const session = await manager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or dead`);
  }

  const keyCode = getKeyCode(keyName);
  await session.write(keyCode);

  return {
    status: 'sent',
    key: keyName,
    session_id: sessionId,
  };
}

/**
 * Handle read command
 */
async function handleRead(
  manager: SessionManager,
  sessionId: string,
  options: {
    timeout?: number;
    wait?: boolean;
    follow?: boolean;
    lines?: number;
  }
): Promise<string> {
  if (!sessionId) {
    throw new Error('Usage: delta-sessions read <session_id> [options]');
  }

  const session = await manager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or dead`);
  }

  if (options.follow) {
    // Stream output continuously
    for await (const output of session.streamOutput()) {
      process.stdout.write(output);
    }
    return ''; // Won't reach here normally
  }

  if (options.wait) {
    // Block until output available
    return await session.readWithTimeout(Number.MAX_SAFE_INTEGER, { lines: options.lines });
  }

  if (options.timeout !== undefined && options.timeout > 0) {
    // Wait with timeout
    return await session.readWithTimeout(options.timeout, { lines: options.lines });
  }

  // Immediate read
  let output = await session.read();

  if (options.lines) {
    const lines = output.split('\n');
    output = lines.slice(-options.lines).join('\n');
  }

  return output;
}

/**
 * Handle end command
 */
async function handleEnd(manager: SessionManager, sessionId: string): Promise<EndResult> {
  if (!sessionId) {
    throw new Error('Usage: delta-sessions end <session_id>');
  }

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
 * Handle status command
 */
async function handleStatus(manager: SessionManager, sessionId: string): Promise<StatusResult> {
  if (!sessionId) {
    throw new Error('Usage: delta-sessions status <session_id>');
  }

  return await manager.getSessionStatus(sessionId);
}

/**
 * Handle cleanup command
 */
async function handleCleanup(manager: SessionManager): Promise<CleanupResult> {
  const cleaned = await manager.cleanup();
  const remaining = await manager.listSessions();

  return {
    cleaned,
    remaining: remaining.map((s) => s.session_id),
  };
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): {
  command: string;
  commandArgs: string[];
  sessionsDir: string;
  options: Record<string, any>;
} {
  const result = {
    command: '',
    commandArgs: [] as string[],
    sessionsDir: path.join(process.cwd(), '.sessions'),
    options: {} as Record<string, any>,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (!arg) {
      i++;
      continue;
    }

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version') {
      printVersion();
      process.exit(0);
    } else if (arg === '--sessions-dir') {
      i++;
      const nextArg = args[i];
      if (!nextArg) {
        throw new Error('--sessions-dir requires a value');
      }
      result.sessionsDir = nextArg;
    } else if (arg.startsWith('--')) {
      // Parse option
      const optionName = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        // Option with value
        i++;
        result.options[optionName] = nextArg;
      } else {
        // Boolean option
        result.options[optionName] = true;
      }
    } else if (!result.command) {
      // First non-option is the command
      result.command = arg;
    } else {
      // Rest are command arguments
      result.commandArgs.push(arg);
    }

    i++;
  }

  return result;
}

/**
 * Main entry point
 */
async function main() {
  try {
    const args = process.argv.slice(2);

    if (args.length === 0) {
      printHelp();
      process.exit(1);
    }

    const { command, commandArgs, sessionsDir, options } = parseArgs(args);

    if (!command) {
      throw new Error('No command specified');
    }

    const manager = new SessionManager({ sessions_dir: sessionsDir });

    let result: any;

    switch (command) {
      case 'start':
        result = await handleStart(manager, commandArgs);
        break;

      case 'write':
        if (!commandArgs[0]) {
          throw new Error('Missing session_id argument');
        }
        result = await handleWrite(manager, commandArgs[0]);
        break;

      case 'write-key':
        if (!commandArgs[0] || !commandArgs[1]) {
          throw new Error('Missing session_id or key_name argument');
        }
        result = await handleWriteKey(manager, commandArgs[0], commandArgs[1]);
        break;

      case 'read': {
        if (!commandArgs[0]) {
          throw new Error('Missing session_id argument');
        }
        const readOptions = {
          timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
          wait: options.wait === true,
          follow: options.follow === true,
          lines: options.lines ? parseInt(options.lines, 10) : undefined,
        };
        const output = await handleRead(manager, commandArgs[0], readOptions);
        // For read command, output raw text to stdout (not JSON)
        process.stdout.write(output);
        process.exit(0);
      }

      case 'end':
        if (!commandArgs[0]) {
          throw new Error('Missing session_id argument');
        }
        result = await handleEnd(manager, commandArgs[0]);
        break;

      case 'list':
        result = await handleList(manager);
        break;

      case 'status':
        if (!commandArgs[0]) {
          throw new Error('Missing session_id argument');
        }
        result = await handleStatus(manager, commandArgs[0]);
        break;

      case 'cleanup':
        result = await handleCleanup(manager);
        break;

      default:
        throw new Error(`Unknown command: ${command}`);
    }

    // Output JSON result
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    // Output error to stderr
    console.error((error as Error).message);
    // Output error as JSON to stdout for consistency
    console.log(JSON.stringify({ error: (error as Error).message }));
    process.exit(1);
  }
}

// Run main
main();
