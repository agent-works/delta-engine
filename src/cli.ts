#!/usr/bin/env node

import { Command } from 'commander';
import { initializeContext, checkForResumableRun, checkForSpecificRun, resumeContext, cleanupWorkspaceSessions } from './context.js';
import { EngineContext } from './types.js';
import { Engine } from './engine.js';
import { RunStatus } from './journal-types.js';
import { handleInitCommand } from './commands/init.js';
import { handleToolExpandCommand } from './commands/tool-expand.js';
import { handleListRunsCommand } from './commands/list-runs.js';
import { buildRunResult, formatOutput } from './output-formatter.js';
import { OutputFormat } from './types.js';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Get package.json path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

/**
 * Format console output with consistent styling
 * v1.10: All logs ALWAYS go to stderr (I/O separation principle)
 * This ensures stdout is reserved for structured output only
 */
const logger = {
  // All logging methods use stderr to maintain I/O separation
  info: (message: string) => console.error(`[INFO] ${message}`),
  success: (message: string) => console.error(`[SUCCESS] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
  debug: (message: string) => console.error(`[DEBUG] ${message}`),
  divider: () => console.error('─'.repeat(60)),
};

/**
 * v1.8: Helper function to run engine with logging and cleanup
 * v1.10: Added format parameter for structured output
 * Reduces duplication between handleRunCommand and handleContinueCommand
 */
async function runEngineWithLogging(
  context: EngineContext,
  options: { verbose?: boolean; format?: string }
): Promise<void> {
  logger.divider();

  // Initialize and run the engine
  logger.info('🚀 Starting Delta Engine...');
  logger.divider();

  const engine = new Engine(context);
  await engine.initialize();

  // Set up signal handlers to mark run as INTERRUPTED
  const handleInterrupt = async () => {
    logger.divider();
    logger.info('Received interrupt signal, marking run as INTERRUPTED...');
    try {
      const journal = engine.getJournal();
      await journal.updateMetadata({ status: RunStatus.INTERRUPTED });
      await journal.logSystemMessage('INFO', 'Run interrupted by user');
      await journal.flush();
      await journal.close();
      logger.info('Run marked as INTERRUPTED. You can resume by running the same command again.');

      // Clean up sessions on interrupt
      logger.info('Cleaning up sessions...');
      const cleanedCount = await cleanupWorkspaceSessions(context.workDir);
      if (cleanedCount > 0) {
        logger.info(`  • Cleaned up ${cleanedCount} session(s)`);
      }
    } catch (error) {
      logger.error('Failed to mark run as interrupted: ' + error);
    }
    process.exit(130); // Standard exit code for SIGINT
  };

  process.on('SIGINT', handleInterrupt);
  process.on('SIGTERM', handleInterrupt);

  try {
    // Run the main engine loop
    const finalResponse = await engine.run();

    // Get metadata and events for output formatting
    const journal = engine.getJournal();
    const events = await journal.readJournal();
    const metadata = await journal.readMetadata();

    // v1.10: Use output formatters for ALL formats (universal I/O separation)
    const outputFormat = (options.format || 'text') as OutputFormat;

    // Log completion to stderr (for all formats)
    logger.divider();
    logger.success('✨ Agent completed successfully!');
    logger.divider();
    logger.info(`Work directory: ${context.workDir}`);
    logger.info(`Journal log: ${path.join(context.deltaDir, context.runId, 'journal.jsonl')}`);

    if (options.verbose) {
      logger.divider();
      logger.info('Journal Events:');
      events.forEach(event => {
        console.error(`  [${event.seq}] ${event.type} at ${new Date(event.timestamp).toLocaleTimeString()}`);
      });
    }

    logger.divider();

    // Build structured output and send to stdout (for all formats)
    const runResult = buildRunResult(metadata, finalResponse);
    runResult.metadata.workspace_path = context.workDir;

    // Output to stdout (clean, no logs)
    console.log(formatOutput(runResult, outputFormat));

    // Clean up sessions after successful completion
    logger.info('Cleaning up sessions...');
    const cleanedCount = await cleanupWorkspaceSessions(context.workDir);
    if (cleanedCount > 0) {
      logger.info(`  • Cleaned up ${cleanedCount} session(s)`);
    }

  } catch (engineError) {
    logger.divider();
    logger.error('Engine execution failed!');

    if (engineError instanceof Error) {
      logger.error(engineError.message);

      if (options.verbose && engineError.stack) {
        logger.debug('Stack trace:');
        console.error(engineError.stack);
      }
    } else {
      logger.error(String(engineError));
    }

    // Try to print journal summary if available
    try {
      const journal = engine.getJournal();
      const events = await journal.readJournal();
      const metadata = await journal.readMetadata();

      logger.divider();
      logger.info('Partial Execution Summary:');
      logger.info(`  • Iterations before failure: ${metadata.iterations_completed}`);
      logger.info(`  • Events logged: ${events.length}`);
      logger.info(`Check journal log for details: ${path.join(context.deltaDir, context.runId, 'journal.jsonl')}`);

      // Clean up sessions after failure (unless waiting for input)
      if (metadata.status !== RunStatus.WAITING_FOR_INPUT) {
        logger.info('Cleaning up sessions...');
        const cleanedCount = await cleanupWorkspaceSessions(context.workDir);
        if (cleanedCount > 0) {
          logger.info(`  • Cleaned up ${cleanedCount} session(s)`);
        }
      }
    } catch {
      // Ignore errors when trying to print journal or cleanup
    }

    logger.divider();
    throw engineError; // Re-throw to let caller handle exit
  }
}

/**
 * Handle the run command
 * v1.8: Updated parameter name from 'task' to 'message' for semantic clarity
 * v1.10: Added runId and format parameters
 */
async function handleRunCommand(options: {
  agent: string;
  message: string;
  workDir?: string;
  runId?: string;
  format?: string;
  maxIterations?: number;
  verbose?: boolean;
  interactive?: boolean;
  yes?: boolean;
}) {
  try {
    // Check if API key is configured
    if (!process.env.DELTA_API_KEY) {
      logger.divider();
      logger.error('API key not found!');
      logger.divider();
      logger.info('Please set the following environment variable:');
      logger.info('');
      logger.info('  export DELTA_API_KEY="your-api-key-here"');
      logger.info('');
      logger.info('Optional: Configure custom API endpoint:');
      logger.info('');
      logger.info('  export DELTA_BASE_URL="https://your-endpoint.com/v1"');
      logger.divider();
      process.exit(1);
    }

    logger.divider();
    logger.info('Starting Delta Engine...');
    logger.info(`Agent Path: ${options.agent}`);
    logger.info(`Message: ${options.message}`);

    if (options.workDir) {
      logger.info(`Work Directory: ${options.workDir}`);
    }

    if (options.interactive) {
      logger.info(`Mode: Interactive (-i)`);
    }

    logger.divider();

    // Check for resumable run if work directory is provided
    let context: EngineContext;
    let isResuming = false;

    if (options.workDir) {
      const resumableRunDir = await checkForResumableRun(options.workDir);

      if (resumableRunDir) {
        logger.info('Found a resumable run with status WAITING_FOR_INPUT or INTERRUPTED');
        logger.info('Resuming existing run...');
        context = await resumeContext(options.workDir, resumableRunDir, options.interactive);
        isResuming = true;
      } else {
        logger.info('Initializing new engine context...');
        context = await initializeContext(
          options.agent,
          options.message,
          options.workDir,
          options.interactive,
          options.maxIterations,
          true, // explicitWorkDir = true
          options.yes,
          options.runId // v1.10: Client-generated run ID
        );
      }
    } else {
      // No work directory specified, create new run
      logger.info('Initializing new engine context...');
      context = await initializeContext(
        options.agent,
        options.message,
        options.workDir,
        options.interactive,
        options.maxIterations,
        false, // explicitWorkDir = false
        options.yes,
        options.runId // v1.10: Client-generated run ID
      );
    }

    // Print initialization success information
    if (isResuming) {
      logger.success('Successfully resumed existing run!');
    } else {
      logger.success('Engine context initialized successfully!');
    }
    logger.divider();

    // v1.8: Show loaded environment files
    if (context.loadedEnvFiles && context.loadedEnvFiles.length > 0) {
      logger.info('Environment files loaded:');
      context.loadedEnvFiles.forEach(file => {
        logger.info(`  ✓ ${file}`);
      });
      logger.divider();
    }

    logger.info(`Run ID: ${context.runId}`);
    logger.info(`Work Directory: ${context.workDir}`);
    logger.info(`Agent Name: ${context.config.name}`);
    logger.info(`Agent Version: ${context.config.version}`);

    if (context.config.description) {
      logger.info(`Agent Description: ${context.config.description}`);
    }

    logger.info(`Number of Tools: ${context.config.tools.length}`);
    logger.info(`LLM Model: ${context.config.llm.model}`);

    // v1.8: Show custom API endpoint if configured
    const apiEndpoint = process.env.DELTA_BASE_URL;
    if (apiEndpoint) {
      logger.info(`API Endpoint: ${apiEndpoint}`);
    }

    logger.info(`Max Iterations: ${context.config.max_iterations}`);

    if (options.verbose) {
      logger.divider();
      logger.debug('Loaded Tools:');
      context.config.tools.forEach(tool => {
        logger.debug(`  - ${tool.name}: ${tool.command.join(' ')}`);
      });
    }

    // v1.8: Use helper function for engine execution
    // v1.10: Pass format parameter
    await runEngineWithLogging(context, { verbose: options.verbose, format: options.format });

  } catch (error) {
    logger.divider();
    logger.error('Failed to initialize Delta Engine');

    if (error instanceof Error) {
      logger.error(error.message);

      if (options.verbose && error.stack) {
        logger.debug('Stack trace:');
        console.error(error.stack);
      }
    } else {
      logger.error(String(error));
    }

    logger.divider();
    process.exit(1);
  }
}

/**
 * v1.8: Handle the continue command with state machine logic
 * v1.10: Added force and format parameters
 * v1.10 Blocker 2 Fix: Added runId as required parameter
 */
async function handleContinueCommand(options: {
  runId: string;
  workDir: string;
  message?: string;
  force?: boolean;
  format?: string;
  verbose?: boolean;
  interactive?: boolean;
}) {
  try {
    // v1.8: Check if API key is configured
    if (!process.env.DELTA_API_KEY) {
      logger.divider();
      logger.error('API key not found!');
      logger.divider();
      logger.info('Please set the following environment variable:');
      logger.info('');
      logger.info('  export DELTA_API_KEY="your-api-key-here"');
      logger.info('');
      logger.info('Optional: Configure custom API endpoint:');
      logger.info('');
      logger.info('  export DELTA_BASE_URL="https://your-endpoint.com/v1"');
      logger.divider();
      process.exit(1);
    }

    logger.divider();
    logger.info('Delta Continue - Resume or extend existing run');
    logger.info(`Run ID: ${options.runId}`);
    logger.info(`Work Directory: ${options.workDir}`);
    logger.divider();

    // v1.10 Blocker 2 Fix: Check for specific run (explicit-only continuation)
    const runInfo = await checkForSpecificRun(options.workDir, options.runId);

    if (!runInfo) {
      logger.error(`Run '${options.runId}' not found in work directory.`);
      logger.info('');
      logger.info('To list available runs:');
      logger.info(`  delta list-runs -w ${options.workDir} --resumable`);
      logger.info('');
      logger.info('Or use `delta run` to start a new run.');
      logger.divider();
      process.exit(1);
    }

    const { runDir, status } = runInfo;
    logger.info(`Found run with status: ${status}`);
    logger.divider();

    // State machine logic based on RunStatus
    let context: EngineContext;

    switch (status) {
      case RunStatus.RUNNING:
        // v1.10: With Janitor mechanism, we can attempt to continue if --force is provided
        if (!options.force) {
          logger.error('Cannot continue: Run is currently RUNNING');
          logger.info('');
          logger.info('This run may still be active. Options:');
          logger.info('  1. Wait for the run to finish or become INTERRUPTED/WAITING_FOR_INPUT');
          logger.info('  2. Use --force to attempt recovery (only if you are certain the process is dead)');
          logger.divider();
          process.exit(1);
        }

        logger.info('Attempting to resume RUNNING run with --force (Janitor check)...');
        logger.info('');
        context = await resumeContext(options.workDir, runDir, options.interactive, options.message, options.force);
        break;

      case RunStatus.INTERRUPTED:
        // Resume with optional message
        logger.info('Resuming INTERRUPTED run...');
        if (options.message) {
          logger.info(`Continuing with message: ${options.message}`);
        }
        context = await resumeContext(options.workDir, runDir, options.interactive, options.message, options.force);
        break;

      case RunStatus.WAITING_FOR_INPUT:
        // Require message and write to response.txt
        if (!options.message) {
          logger.error('Message required for WAITING_FOR_INPUT status');
          logger.info('');
          logger.info('Usage: delta continue --work-dir <path> -m "Your response"');
          logger.divider();
          process.exit(1);
        }

        logger.info('Providing response to WAITING_FOR_INPUT...');

        // Write response.txt for ask_human
        const interactionDir = path.join(runDir, 'interaction');
        const responsePath = path.join(interactionDir, 'response.txt');

        const fs = await import('node:fs/promises');
        await fs.mkdir(interactionDir, { recursive: true });
        await fs.writeFile(responsePath, options.message, 'utf-8');

        logger.info(`Response written to: ${responsePath}`);

        context = await resumeContext(options.workDir, runDir, options.interactive, options.message, options.force);
        break;

      case RunStatus.COMPLETED:
        // Require message to extend conversation
        if (!options.message) {
          logger.error('Message required to extend COMPLETED conversation');
          logger.info('');
          logger.info('Usage: delta continue --work-dir <path> -m "Additional task"');
          logger.divider();
          process.exit(1);
        }

        logger.info('Extending COMPLETED conversation...');
        logger.info(`New message: ${options.message}`);

        context = await resumeContext(options.workDir, runDir, options.interactive, options.message, options.force);
        break;

      case RunStatus.FAILED:
        // Require message to retry with new context
        if (!options.message) {
          logger.error('Message required to retry FAILED run');
          logger.info('');
          logger.info('Usage: delta continue --work-dir <path> -m "Guidance for retry"');
          logger.divider();
          process.exit(1);
        }

        logger.info('Retrying FAILED run with new context...');
        logger.info(`Retry message: ${options.message}`);

        context = await resumeContext(options.workDir, runDir, options.interactive, options.message, options.force);
        break;

      default:
        logger.error(`Unknown run status: ${status}`);
        logger.divider();
        process.exit(1);
    }

    // Print context information
    logger.success('Context loaded successfully!');
    logger.divider();

    // v1.8: Show loaded environment files
    if (context.loadedEnvFiles && context.loadedEnvFiles.length > 0) {
      logger.info('Environment files loaded:');
      context.loadedEnvFiles.forEach(file => {
        logger.info(`  ✓ ${file}`);
      });
      logger.divider();
    }

    logger.info(`Run ID: ${context.runId}`);
    logger.info(`Work Directory: ${context.workDir}`);
    logger.info(`Agent Name: ${context.config.name}`);
    logger.info(`Agent Version: ${context.config.version}`);
    logger.info(`Number of Tools: ${context.config.tools.length}`);
    logger.info(`LLM Model: ${context.config.llm.model}`);

    // Show custom API endpoint if configured
    const apiEndpoint = process.env.DELTA_BASE_URL;
    if (apiEndpoint) {
      logger.info(`API Endpoint: ${apiEndpoint}`);
    }

    logger.info(`Max Iterations: ${context.config.max_iterations}`);

    if (options.verbose) {
      logger.divider();
      logger.debug('Loaded Tools:');
      context.config.tools.forEach(tool => {
        logger.debug(`  - ${tool.name}: ${tool.command.join(' ')}`);
      });
    }

    // Use helper function for engine execution
    // v1.10: Pass format parameter
    await runEngineWithLogging(context, { verbose: options.verbose, format: options.format });

  } catch (error) {
    logger.divider();
    logger.error('Failed to continue run');

    if (error instanceof Error) {
      logger.error(error.message);

      if (options.verbose && error.stack) {
        logger.debug('Stack trace:');
        console.error(error.stack);
      }
    } else {
      logger.error(String(error));
    }

    logger.divider();
    process.exit(1);
  }
}

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('delta-engine')
    .description('Delta Engine - A minimalist platform for AI Agent prototype iteration')
    .version(packageJson.version);

  // Define the init command
  program
    .command('init [name]')
    .description('Initialize a new Delta Engine agent from a template')
    .option(
      '-t, --template <name>',
      'Template to use (minimal, hello-world, file-ops, api-tester)'
    )
    .option(
      '-y, --yes',
      'Use minimal template without prompting',
      false
    )
    .action(handleInitCommand);

  // Define the run command (v1.8: updated to use -m/--message, v1.9: agent defaults to current dir, v1.10: added --run-id and --format)
  program
    .command('run')
    .description('Execute an AI agent with a specified task')
    .option(
      '-a, --agent <path>',
      'Path to the agent directory containing config.yaml and system_prompt.txt (defaults to current directory)',
      '.'
    )
    .requiredOption(
      '-m, --message <description>',
      'Task description for the agent to execute'
    )
    .option(
      '-w, --work-dir <path>',
      'Custom work directory path (defaults to auto-generated under agent/workspaces/)'
    )
    .option(
      '--run-id <id>',
      'Client-generated run ID for deterministic tracking (optional, auto-generated if not provided)'
    )
    .option(
      '--format <format>',
      'Output format: text (human-readable), json (structured), raw (Unix pipes)',
      'text'
    )
    .option(
      '--max-iterations <number>',
      'Maximum Think-Act-Observe iterations (overrides config.yaml)',
      (value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed < 1) {
          throw new Error('max-iterations must be a positive integer');
        }
        return parsed;
      }
    )
    .option(
      '-v, --verbose',
      'Enable verbose output',
      false
    )
    .option(
      '-i, --interactive',
      'Enable interactive mode for ask_human tool',
      false
    )
    .option(
      '-y, --yes',
      'Skip workspace selection prompt and auto-create new workspace',
      false
    )
    .action(handleRunCommand);

  // v1.8: Add continue command (v1.10: added --force and --format)
  // v1.10 Blocker 2 Fix: --run-id is now required (Frontierless Workspace compliance)
  program
    .command('continue')
    .description('Resume or extend an existing run with explicit run ID')
    .requiredOption(
      '--run-id <id>',
      'Run ID to continue (use "delta list-runs" to find available runs)'
    )
    .requiredOption(
      '-w, --work-dir <path>',
      'Work directory containing the run to continue'
    )
    .option(
      '-m, --message <description>',
      'Optional message to inject (required for WAITING_FOR_INPUT, COMPLETED, FAILED states)'
    )
    .option(
      '--force',
      'Force continue orphaned RUNNING run from different host (skip cross-host safety check)',
      false
    )
    .option(
      '--format <format>',
      'Output format: text (human-readable), json (structured), raw (Unix pipes)',
      'text'
    )
    .option(
      '-v, --verbose',
      'Enable verbose output',
      false
    )
    .option(
      '-i, --interactive',
      'Enable interactive mode for ask_human tool',
      false
    )
    .action(handleContinueCommand);

  // v1.10: Add list-runs command
  program
    .command('list-runs')
    .description('List all runs in a work directory with optional filtering')
    .option(
      '-w, --work-dir <path>',
      'Work directory to scan for runs (defaults to current directory)'
    )
    .option(
      '--resumable',
      'Show only resumable runs (WAITING_FOR_INPUT or INTERRUPTED)',
      false
    )
    .option(
      '--status <status>',
      'Filter runs by specific status (RUNNING, COMPLETED, FAILED, etc.)'
    )
    .option(
      '--first',
      'Return only the most recent run',
      false
    )
    .option(
      '--format <format>',
      'Output format: text (human-readable) or json (structured)',
      'text'
    )
    .action(handleListRunsCommand);

  // v1.7: Add tool expand command
  program
    .command('tool:expand <config-path>')
    .description('Expand v1.7 simplified syntax (exec:, shell:) to full ToolDefinition format')
    .action(handleToolExpandCommand);

  // Add a default help command
  program
    .command('help', { isDefault: true })
    .description('Display help information')
    .action(() => {
      program.outputHelp();
    });

  return program;
}

/**
 * Parse command line arguments and execute
 */
export async function run(): Promise<void> {
  // Check for version flags before commander.js processes them
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '-v' || args[0] === '--version')) {
    console.log(packageJson.version);
    process.exit(0);
  }

  const program = createProgram();
  await program.parseAsync(process.argv);
}