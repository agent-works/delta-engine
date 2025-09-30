#!/usr/bin/env node

/**
 * Unit tests for ask-human.ts
 *
 * Tests specification-driven behavior from docs/architecture/v1.2-human-interaction.md:
 * - Interactive mode (-i flag): Synchronous readline prompts
 * - Async mode (default): File-based interaction with pause/resume
 * - Sensitive input handling (password mode)
 * - Confirmation input type (yes/no)
 * - Interaction file cleanup
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import {
  isAskHumanTool,
  handleAskHumanAsync,
  checkForInteractionResponse,
  AskHumanParams,
} from '../../src/ask-human.js';
import { EngineContext, AgentConfig } from '../../src/types.js';
import { createJournal } from '../../src/journal.js';
import { RunStatus } from '../../src/journal-types.js';

describe('ask-human.ts', () => {
  let tempDir: string;
  let workDir: string;
  let agentPath: string;
  let context: EngineContext;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `ask-human-test-${uuidv4()}`);
    workDir = path.join(tempDir, 'work');
    agentPath = path.join(tempDir, 'agent');

    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(agentPath, { recursive: true });

    const runId = `test_run_${uuidv4()}`;
    const deltaDir = path.join(workDir, '.delta');
    const runDir = path.join(deltaDir, runId);

    await fs.mkdir(runDir, { recursive: true });

    const mockConfig: AgentConfig = {
      name: 'test-agent',
      version: '1.0.0',
      llm: {
        model: 'gpt-4',
        temperature: 0.7,
      },
      tools: [],
      max_iterations: 10,
    };

    const journal = createJournal(runId, runDir);
    await journal.initialize();
    await journal.initializeMetadata(agentPath, 'Test task');

    context = {
      runId,
      agentPath,
      workDir,
      deltaDir,
      config: mockConfig,
      systemPrompt: 'Test prompt',
      initialTask: 'Test task',
      currentStep: 0,
      journal,
      isInteractive: false,
    };
  });

  afterEach(async () => {
    try {
      await context.journal.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('isAskHumanTool', () => {
    it('should return true for ask_human tool name', () => {
      expect(isAskHumanTool('ask_human')).toBe(true);
    });

    it('should return false for other tool names', () => {
      expect(isAskHumanTool('other_tool')).toBe(false);
      expect(isAskHumanTool('ask_human_2')).toBe(false);
      expect(isAskHumanTool('')).toBe(false);
    });
  });

  describe('handleAskHumanAsync - Async Mode', () => {
    it('should create request.json with correct structure', async () => {
      const params: AskHumanParams = {
        prompt: 'What is your name?',
        input_type: 'text',
        sensitive: false,
      };

      await handleAskHumanAsync(context, params);

      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      const requestPath = path.join(interactionDir, 'request.json');

      const requestExists = await fs.access(requestPath).then(() => true).catch(() => false);
      expect(requestExists).toBe(true);

      const requestContent = JSON.parse(await fs.readFile(requestPath, 'utf-8'));
      expect(requestContent.request_id).toBeDefined();
      expect(requestContent.timestamp).toBeDefined();
      expect(requestContent.prompt).toBe('What is your name?');
      expect(requestContent.input_type).toBe('text');
      expect(requestContent.sensitive).toBe(false);
    });

    it('should default input_type to text', async () => {
      const params: AskHumanParams = {
        prompt: 'Enter data',
      };

      await handleAskHumanAsync(context, params);

      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      const requestPath = path.join(interactionDir, 'request.json');
      const requestContent = JSON.parse(await fs.readFile(requestPath, 'utf-8'));

      expect(requestContent.input_type).toBe('text');
    });

    it('should default sensitive to false', async () => {
      const params: AskHumanParams = {
        prompt: 'Enter data',
      };

      await handleAskHumanAsync(context, params);

      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      const requestPath = path.join(interactionDir, 'request.json');
      const requestContent = JSON.parse(await fs.readFile(requestPath, 'utf-8'));

      expect(requestContent.sensitive).toBe(false);
    });

    it('should set sensitive flag when provided', async () => {
      const params: AskHumanParams = {
        prompt: 'Enter password',
        input_type: 'password',
        sensitive: true,
      };

      await handleAskHumanAsync(context, params);

      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      const requestPath = path.join(interactionDir, 'request.json');
      const requestContent = JSON.parse(await fs.readFile(requestPath, 'utf-8'));

      expect(requestContent.sensitive).toBe(true);
    });

    it('should update metadata status to WAITING_FOR_INPUT', async () => {
      const params: AskHumanParams = {
        prompt: 'Test prompt',
      };

      await handleAskHumanAsync(context, params);

      const metadata = await context.journal.readMetadata();
      expect(metadata.status).toBe(RunStatus.WAITING_FOR_INPUT);
    });

    it('should create interaction directory if it does not exist', async () => {
      const params: AskHumanParams = {
        prompt: 'Test',
      };

      // Ensure interaction directory doesn't exist yet
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      const dirExistsBefore = await fs.access(interactionDir).then(() => true).catch(() => false);
      expect(dirExistsBefore).toBe(false);

      await handleAskHumanAsync(context, params);

      const dirExistsAfter = await fs.access(interactionDir).then(() => true).catch(() => false);
      expect(dirExistsAfter).toBe(true);
    });
  });

  describe('checkForInteractionResponse', () => {
    it('should return response text when both request and response exist', async () => {
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.mkdir(interactionDir, { recursive: true });

      const request = {
        request_id: uuidv4(),
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        input_type: 'text',
        sensitive: false,
      };

      await fs.writeFile(
        path.join(interactionDir, 'request.json'),
        JSON.stringify(request),
        'utf-8'
      );
      await fs.writeFile(
        path.join(interactionDir, 'response.txt'),
        'User response',
        'utf-8'
      );

      const response = await checkForInteractionResponse(workDir, context.runId);
      expect(response).toBe('User response');
    });

    it('should trim whitespace from response', async () => {
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.mkdir(interactionDir, { recursive: true });

      const request = {
        request_id: uuidv4(),
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        input_type: 'text',
        sensitive: false,
      };

      await fs.writeFile(
        path.join(interactionDir, 'request.json'),
        JSON.stringify(request),
        'utf-8'
      );
      await fs.writeFile(
        path.join(interactionDir, 'response.txt'),
        '  User response with spaces  \n',
        'utf-8'
      );

      const response = await checkForInteractionResponse(workDir, context.runId);
      expect(response).toBe('User response with spaces');
    });

    it('should clean up request and response files after reading', async () => {
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.mkdir(interactionDir, { recursive: true });

      const request = {
        request_id: uuidv4(),
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        input_type: 'text',
        sensitive: false,
      };

      await fs.writeFile(
        path.join(interactionDir, 'request.json'),
        JSON.stringify(request),
        'utf-8'
      );
      await fs.writeFile(
        path.join(interactionDir, 'response.txt'),
        'Response',
        'utf-8'
      );

      await checkForInteractionResponse(workDir, context.runId);

      // Verify files were deleted
      const requestExists = await fs.access(path.join(interactionDir, 'request.json'))
        .then(() => true)
        .catch(() => false);
      const responseExists = await fs.access(path.join(interactionDir, 'response.txt'))
        .then(() => true)
        .catch(() => false);

      expect(requestExists).toBe(false);
      expect(responseExists).toBe(false);
    });

    it('should return null when request does not exist', async () => {
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.mkdir(interactionDir, { recursive: true });

      // Only create response, not request
      await fs.writeFile(
        path.join(interactionDir, 'response.txt'),
        'Response',
        'utf-8'
      );

      const response = await checkForInteractionResponse(workDir, context.runId);
      expect(response).toBeNull();
    });

    it('should return null when response does not exist', async () => {
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.mkdir(interactionDir, { recursive: true });

      const request = {
        request_id: uuidv4(),
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        input_type: 'text',
        sensitive: false,
      };

      // Only create request, not response
      await fs.writeFile(
        path.join(interactionDir, 'request.json'),
        JSON.stringify(request),
        'utf-8'
      );

      const response = await checkForInteractionResponse(workDir, context.runId);
      expect(response).toBeNull();
    });

    it('should return null when interaction directory does not exist', async () => {
      const response = await checkForInteractionResponse(workDir, context.runId);
      expect(response).toBeNull();
    });

    it('should handle empty response file', async () => {
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.mkdir(interactionDir, { recursive: true });

      const request = {
        request_id: uuidv4(),
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        input_type: 'text',
        sensitive: false,
      };

      await fs.writeFile(
        path.join(interactionDir, 'request.json'),
        JSON.stringify(request),
        'utf-8'
      );
      await fs.writeFile(
        path.join(interactionDir, 'response.txt'),
        '',
        'utf-8'
      );

      const response = await checkForInteractionResponse(workDir, context.runId);
      expect(response).toBe('');
    });
  });

  describe('Async Mode - Integration', () => {
    it('should support full async workflow: create request → check for response → cleanup', async () => {
      // Step 1: Agent creates request
      const params: AskHumanParams = {
        prompt: 'Do you approve?',
        input_type: 'confirmation',
      };

      await handleAskHumanAsync(context, params);

      // Step 2: User provides response (simulated)
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.writeFile(
        path.join(interactionDir, 'response.txt'),
        'yes',
        'utf-8'
      );

      // Step 3: Agent checks for response
      const response = await checkForInteractionResponse(workDir, context.runId);
      expect(response).toBe('yes');

      // Step 4: Verify cleanup
      const requestExists = await fs.access(path.join(interactionDir, 'request.json'))
        .then(() => true)
        .catch(() => false);
      expect(requestExists).toBe(false);
    });

    it('should handle multiple async interactions sequentially', async () => {
      // First interaction
      await handleAskHumanAsync(context, { prompt: 'First question' });
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.writeFile(path.join(interactionDir, 'response.txt'), 'First answer', 'utf-8');
      const response1 = await checkForInteractionResponse(workDir, context.runId);
      expect(response1).toBe('First answer');

      // Second interaction (files should be cleaned up from first)
      await handleAskHumanAsync(context, { prompt: 'Second question' });
      await fs.writeFile(path.join(interactionDir, 'response.txt'), 'Second answer', 'utf-8');
      const response2 = await checkForInteractionResponse(workDir, context.runId);
      expect(response2).toBe('Second answer');
    });
  });
});
