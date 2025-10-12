#!/usr/bin/env node

/**
 * Delta Engine - Main Entry Point
 *
 * This is the primary entry point for the delta-engine CLI.
 * It imports and executes the CLI program defined in cli.ts.
 */

import { run } from './cli.js';

// Note: Environment variables are now loaded in context.ts via env-loader.ts
// This allows for cascading .env file loading (workspace > agent > project root)

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  process.exit(1);
});

// Execute the CLI program
run().catch((error) => {
  console.error('[FATAL] Failed to run delta-engine:', error);
  process.exit(1);
});