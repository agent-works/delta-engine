import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { EngineContext } from './types.js';
import { RunStatus } from './journal-types.js';

/**
 * Request structure for human interaction
 */
export interface HumanInteractionRequest {
  request_id: string;
  timestamp: string;
  prompt: string;
  input_type: string;
  sensitive: boolean;
}

/**
 * Parameters for ask_human tool
 */
export interface AskHumanParams {
  prompt: string;
  input_type?: string;
  sensitive?: boolean;
}

/**
 * Check if a tool call is for ask_human
 */
export function isAskHumanTool(toolName: string): boolean {
  return toolName === 'ask_human';
}

/**
 * Handle ask_human tool execution in async mode
 * Creates interaction request and prepares for pause
 */
export async function handleAskHumanAsync(
  context: EngineContext,
  params: AskHumanParams
): Promise<void> {
  // Create interaction directory if it doesn't exist (v1.3: workDir/.delta/{runId}/interaction)
  const interactionDir = path.join(context.workDir, '.delta', context.runId, 'interaction');
  await fs.mkdir(interactionDir, { recursive: true });

  // Create request object
  const request: HumanInteractionRequest = {
    request_id: uuidv4(),
    timestamp: new Date().toISOString(),
    prompt: params.prompt,
    input_type: params.input_type || 'text',
    sensitive: params.sensitive || false,
  };

  // Write request.json
  const requestPath = path.join(interactionDir, 'request.json');
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2), 'utf-8');

  // Update metadata status to WAITING_FOR_INPUT
  await context.journal.updateMetadata({
    status: RunStatus.WAITING_FOR_INPUT,
  });

  // Print user-friendly instructions
  console.log('\n' + '─'.repeat(60));
  console.log('🔔 Agent paused and is waiting for your input.');
  console.log('─'.repeat(60));
  console.log(`\nPrompt: ${params.prompt}\n`);
  console.log('Action required:');
  console.log(`1. Provide your response in: ${path.join(interactionDir, 'response.txt')}`);
  console.log(`2. Run 'delta run --work-dir ${context.workDir}' to continue.`);
  console.log('─'.repeat(60) + '\n');
}

/**
 * Check if there's a pending interaction response
 */
export async function checkForInteractionResponse(workDir: string, runId: string): Promise<string | null> {
  const interactionDir = path.join(workDir, '.delta', runId, 'interaction');
  const requestPath = path.join(interactionDir, 'request.json');
  const responsePath = path.join(interactionDir, 'response.txt');

  try {
    // Check if both request and response exist
    await fs.access(requestPath);
    await fs.access(responsePath);

    // Read the response
    const response = await fs.readFile(responsePath, 'utf-8');

    // Clean up interaction files
    await fs.unlink(requestPath);
    await fs.unlink(responsePath);

    return response.trim();
  } catch {
    // Either request or response doesn't exist
    return null;
  }
}

/**
 * Handle ask_human tool in interactive mode (-i flag)
 * Provides synchronous terminal input with support for sensitive input
 */
export async function handleAskHumanInteractive(
  params: AskHumanParams
): Promise<string> {
  const rl = readline.createInterface({
    input,
    output,
    terminal: true
  });

  try {
    // Display the prompt
    console.log('\n' + '─'.repeat(60));
    console.log('🔔 Agent is asking for your input:');
    console.log('─'.repeat(60));
    console.log(`\n${params.prompt}\n`);

    // Handle different input types
    const inputType = params.input_type || 'text';
    const isSensitive = params.sensitive || inputType === 'password';

    if (inputType === 'confirmation') {
      // Confirmation: expect yes/no response
      const response = await new Promise<string>((resolve) => {
        rl.question('Please enter yes/no: ', (answer) => {
          resolve(answer.toLowerCase().trim());
        });
      });

      // Validate confirmation response
      if (response !== 'yes' && response !== 'no') {
        console.log('⚠️  Invalid response. Defaulting to "no".');
        return 'no';
      }
      return response;

    } else if (isSensitive || inputType === 'password') {
      // Sensitive input: hide characters
      console.log('(Input will be hidden)');
      const response = await new Promise<string>((resolve) => {
        let input = '';
        const onData = (char: Buffer) => {
          const str = char.toString();
          const code = str.charCodeAt(0);

          if (code === 3) { // Ctrl+C
            process.exit(130);
          } else if (code === 13 || code === 10) { // Enter
            process.stdin.removeListener('data', onData);
            process.stdin.setRawMode!(false);
            process.stdin.pause();
            console.log(); // New line after hidden input
            resolve(input);
          } else if (code === 127 || code === 8) { // Backspace
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write('\b \b'); // Move back, overwrite with space, move back
            }
          } else if (code >= 32 && code <= 126) { // Printable characters
            input += str;
            process.stdout.write('*'); // Show asterisk instead of actual character
          }
        };

        process.stdout.write('> ');
        process.stdin.resume();
        process.stdin.setRawMode!(true);
        process.stdin.on('data', onData);
      });
      return response;

    } else {
      // Regular text input
      const response = await new Promise<string>((resolve) => {
        rl.question('> ', (answer) => {
          resolve(answer);
        });
      });
      return response;
    }

  } finally {
    rl.close();
    console.log('─'.repeat(60) + '\n');
  }
}