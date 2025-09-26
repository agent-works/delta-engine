#!/usr/bin/env node

/**
 * Delta Engine - Main Entry Point
 *
 * This is the primary entry point for the delta-engine CLI.
 * It imports and executes the CLI program defined in cli.ts.
 */

import dotenv from 'dotenv';
import { run } from './cli.js';

// Load environment variables from .env file if it exists
// Suppress dotenv debug output for cleaner CLI output
dotenv.config({ quiet: true } as any);

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