#!/usr/bin/env node

import { Command } from 'commander';
import { initializeContext } from './context.js';
import { EngineContext } from './types.js';
import { Engine } from './engine.js';
import path from 'node:path';

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
  verbose?: boolean;
}) {
  try {
    logger.divider();
    logger.info('Starting Delta Engine...');
    logger.info(`Agent Path: ${options.agent}`);
    logger.info(`Task: ${options.task}`);

    if (options.workDir) {
      logger.info(`Work Directory: ${options.workDir}`);
    }

    logger.divider();

    // Initialize the engine context
    logger.info('Initializing engine context...');

    const context: EngineContext = await initializeContext(
      options.agent,
      options.task,
      options.workDir
    );

    // Print initialization success information
    logger.success('Engine context initialized successfully!');
    logger.divider();
    logger.info(`Run ID: ${context.runId}`);
    logger.info(`Work Directory: ${context.workDir}`);
    logger.info(`Agent Name: ${context.config.name}`);
    logger.info(`Agent Version: ${context.config.version}`);

    if (context.config.description) {
      logger.info(`Agent Description: ${context.config.description}`);
    }

    logger.info(`Number of Tools: ${context.config.tools.length}`);
    logger.info(`LLM Model: ${context.config.llm.model}`);

    // Show custom API URL if configured
    if (process.env.OPENAI_API_URL) {
      logger.info(`API Endpoint: ${process.env.OPENAI_API_URL}`);
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

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      logger.error('OpenAI API key not found!');
      logger.info('Please set the OPENAI_API_KEY environment variable:');
      logger.info('  export OPENAI_API_KEY="your-api-key-here"');
      logger.divider();
      process.exit(1);
    }

    // Initialize and run the engine
    logger.info('🚀 Starting Delta Engine...');
    logger.divider();

    const engine = new Engine(context);

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

      // Print trace summary
      const tracer = engine.getTracer();
      const summary = await tracer.getTraceSummary();

      logger.info('Execution Summary:');
      logger.info(`  • Iterations: ${summary.iterations}`);
      logger.info(`  • LLM Requests: ${summary.llmRequests}`);
      logger.info(`  • Tool Calls: ${summary.toolCalls}`);
      logger.info(`  • Errors: ${summary.errors}`);
      if (summary.duration !== undefined) {
        logger.info(`  • Duration: ${summary.duration.toFixed(2)}s`);
      }

      logger.divider();
      logger.info(`Work directory: ${context.workDir}`);
      logger.info(`Trace log: ${path.join(context.workDir, 'trace.jsonl')}`);

      if (options.verbose) {
        logger.divider();
        await tracer.printTrace();
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

      // Try to print trace if available
      try {
        const tracer = engine.getTracer();
        const summary = await tracer.getTraceSummary();

        logger.divider();
        logger.info('Partial Execution Summary:');
        logger.info(`  • Iterations before failure: ${summary.iterations}`);
        logger.info(`  • Errors encountered: ${summary.errors}`);
        logger.info(`Check trace log for details: ${path.join(context.workDir, 'trace.jsonl')}`);
      } catch {
        // Ignore errors when trying to print trace
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
    .version('1.0.0');

  // Define the run command as per TSD 4.1
  program
    .command('run')
    .description('Execute an AI agent with a specified task')
    .requiredOption(
      '--agent <path>',
      'Path to the agent directory containing config.yaml and system_prompt.txt'
    )
    .requiredOption(
      '--task <description>',
      'Task description for the agent to execute'
    )
    .option(
      '--work-dir <path>',
      'Custom work directory path (defaults to auto-generated under agent/work_runs/)'
    )
    .option(
      '-v, --verbose',
      'Enable verbose output',
      false
    )
    .action(handleRunCommand);

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
  const program = createProgram();
  await program.parseAsync(process.argv);
}