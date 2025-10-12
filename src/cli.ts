#!/usr/bin/env node

import { Command } from 'commander';
import { initializeContext, checkForResumableRun, resumeContext, cleanupWorkspaceSessions } from './context.js';
import { EngineContext } from './types.js';
import { Engine } from './engine.js';
import { RunStatus } from './journal-types.js';
import { handleInitCommand } from './commands/init.js';
import { handleToolExpandCommand } from './commands/tool-expand.js';
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
 */
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  success: (message: string) => console.log(`[SUCCESS] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
  debug: (message: string) => console.log(`[DEBUG] ${message}`),
  divider: () => console.log('─'.repeat(60)),
};

/**
 * Handle the run command
 */
async function handleRunCommand(options: {
  agent: string;
  task: string;
  workDir?: string;
  maxIterations?: number;
  verbose?: boolean;
  interactive?: boolean;
  yes?: boolean;
}) {
  try {
    // v1.8: Check if API key is configured (support both DELTA_* and OPENAI_*)
    if (!process.env.DELTA_API_KEY && !process.env.OPENAI_API_KEY) {
      logger.divider();
      logger.error('API key not found!');
      logger.divider();
      logger.info('Please set one of the following environment variables:');
      logger.info('');
      logger.info('  export DELTA_API_KEY="your-api-key-here"        # Recommended');
      logger.info('  export OPENAI_API_KEY="your-api-key-here"       # Legacy');
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
    logger.info(`Task: ${options.task}`);

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
          options.task,
          options.workDir,
          options.interactive,
          options.maxIterations,
          true, // explicitWorkDir = true
          options.yes
        );
      }
    } else {
      // No work directory specified, create new run
      logger.info('Initializing new engine context...');
      context = await initializeContext(
        options.agent,
        options.task,
        options.workDir,
        options.interactive,
        options.maxIterations,
        false, // explicitWorkDir = false
        options.yes
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

    // v1.8: Show custom API endpoint if configured (support DELTA_* and OPENAI_*)
    const apiEndpoint = process.env.DELTA_BASE_URL ||
                       process.env.OPENAI_BASE_URL ||
                       process.env.OPENAI_API_URL;
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

      logger.divider();
      logger.success('✨ Agent completed successfully!');
      logger.divider();

      // Print the final response
      logger.info('Final Response:');
      console.log(finalResponse);

      logger.divider();

      // Print journal summary
      const journal = engine.getJournal();
      const events = await journal.readJournal();
      const metadata = await journal.readMetadata();

      logger.info('Execution Summary:');
      logger.info(`  • Iterations: ${metadata.iterations_completed}`);
      logger.info(`  • Total Events: ${events.length}`);
      logger.info(`  • Status: ${metadata.status}`);
      if (metadata.end_time && metadata.start_time) {
        const duration = (new Date(metadata.end_time).getTime() - new Date(metadata.start_time).getTime()) / 1000;
        logger.info(`  • Duration: ${duration.toFixed(2)}s`);
      }

      logger.divider();
      logger.info(`Work directory: ${context.workDir}`);
      logger.info(`Journal log: ${path.join(context.deltaDir, context.runId, 'journal.jsonl')}`);

      if (options.verbose) {
        logger.divider();
        logger.info('Journal Events:');
        events.forEach(event => {
          console.log(`  [${event.seq}] ${event.type} at ${new Date(event.timestamp).toLocaleTimeString()}`);
        });
      }

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
      process.exit(1);
    }

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

  // Define the run command as per TSD 4.1
  program
    .command('run')
    .description('Execute an AI agent with a specified task')
    .requiredOption(
      '-a, --agent <path>',
      'Path to the agent directory containing config.yaml and system_prompt.txt'
    )
    .requiredOption(
      '-t, --task <description>',
      'Task description for the agent to execute'
    )
    .option(
      '-w, --work-dir <path>',
      'Custom work directory path (defaults to auto-generated under agent/workspaces/)'
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