import { execa, type ExecaError } from 'execa';
import { EngineContext, ToolDefinition, ToolExecutionResult, InjectionType } from './types.js';

/**
 * Build command arguments and stdin input from tool definition and parameters
 * @param toolDefinition - Tool definition containing parameter specifications
 * @param parameters - Actual parameter values to inject
 * @returns Tuple of [args array, stdin input string]
 */
export function buildCommandAndStdin(
  toolDefinition: ToolDefinition,
  parameters: Record<string, string>
): { args: string[]; stdinInput: string } {
  const args: string[] = [];
  let stdinInput = '';

  // Process each parameter according to its injection type
  for (const paramDef of toolDefinition.parameters) {
    const value = parameters[paramDef.name];

    // Skip if parameter not provided
    if (value === undefined) {
      continue;
    }

    switch (paramDef.inject_as) {
      case InjectionType.Argument:
        // Append value as command line argument at the end
        args.push(value);
        break;

      case InjectionType.Option:
        // Append as --option-name value
        if (paramDef.option_name) {
          args.push(paramDef.option_name);
          args.push(value);
        }
        break;

      case InjectionType.Stdin:
        // Set as stdin input (only one stdin parameter allowed per Zod validation)
        stdinInput = value;
        break;
    }
  }

  return { args, stdinInput };
}

/**
 * Replace ${AGENT_HOME} variables in command array with actual agent path
 * @param items - Array of command/argument strings
 * @param agentPath - Absolute path to agent directory
 * @returns New array with variables replaced
 */
export function replaceVariables(items: string[], agentPath: string): string[] {
  return items.map(item => {
    // Replace all occurrences of ${AGENT_HOME} with agentPath
    return item.replace(/\$\{AGENT_HOME\}/g, agentPath);
  });
}

/**
 * Execute a tool with given parameters in the context's work directory
 * @param context - Engine context containing work directory and agent path
 * @param toolDefinition - Tool definition with command and parameter specs
 * @param parameters - Actual parameter values to pass to the tool
 * @returns Tool execution result with stdout, stderr, and exit code
 */
export async function executeTool(
  context: EngineContext,
  toolDefinition: ToolDefinition,
  parameters: Record<string, string>
): Promise<ToolExecutionResult> {
  // Step 1: Build command arguments and stdin input
  const { args, stdinInput } = buildCommandAndStdin(toolDefinition, parameters);

  // Step 2: Prepare command with variable substitution
  // Clone the command array to avoid mutation
  const baseCommand = [...toolDefinition.command];

  // Replace variables in base command
  const processedCommand = replaceVariables(baseCommand, context.agentPath);

  // Replace variables in arguments
  const processedArgs = replaceVariables(args, context.agentPath);

  // Extract executable and combine all arguments
  const [executable, ...commandArgs] = processedCommand;

  if (!executable) {
    throw new Error('Tool command is empty');
  }

  const finalArgs = [...commandArgs, ...processedArgs];

  // Step 3: Execute command with proper configuration
  try {
    // Universal approach for commands with stdin to prevent file descriptor leaks
    // When stdin is provided (even if empty), use shell pipes for robust stream handling
    // This ensures proper cleanup and avoids Node.js file descriptor warnings
    if (stdinInput !== null && stdinInput !== undefined) {
      // Build the shell command with proper argument escaping
      // Each argument is passed as a positional parameter to avoid injection
      const shellArgs = ['-c'];

      // Build the command string with positional parameters
      let commandString = `printf '%s' "$1" | "${executable}"`;
      const positionalArgs = ['_', stdinInput]; // $0 is '_', $1 is stdin content

      // Add each argument as a positional parameter
      finalArgs.forEach((arg, index) => {
        commandString += ` "$${index + 2}"`; // $2, $3, etc.
        positionalArgs.push(arg);
      });

      shellArgs.push(commandString);
      shellArgs.push(...positionalArgs);

      const result = await execa('sh', shellArgs, {
        cwd: context.workDir,
        reject: false,
        stripFinalNewline: false,
        timeout: 30000, // 30 second timeout to prevent hanging
        env: {
          ...process.env,
          AGENT_HOME: context.agentPath,
        },
      });

      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode ?? (result.failed ? 1 : 0),
        success: !result.failed && result.exitCode === 0,
      };
    }

    // Regular command execution without stdin
    const execOptions: any = {
      cwd: context.workDir,  // Critical: Set CWD to work directory (TSD 4.2.1)
      reject: false,  // Don't throw on non-zero exit (TSD 4.2.4)
      stripFinalNewline: false,  // Preserve output formatting
      timeout: 30000, // 30 second timeout to prevent hanging
      env: {
        ...process.env,
        AGENT_HOME: context.agentPath,  // Also set as environment variable for compatibility
      },
    };

    const result = await execa(executable, finalArgs, execOptions);

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode ?? (result.failed ? 1 : 0),
      success: !result.failed && result.exitCode === 0,
    };
  } catch (error) {
    // Handle unexpected errors (not command failures)
    // This should rarely happen with reject: false, but handle it just in case
    const execaError = error as ExecaError;

    return {
      stdout: execaError.stdout || '',
      stderr: execaError.stderr || execaError.message || 'Unknown error',
      exitCode: execaError.exitCode ?? 1,
      success: false,
    };
  }
}

/**
 * Validate that required parameters are provided for a tool
 * @param toolDefinition - Tool definition
 * @param parameters - Provided parameters
 * @returns Array of missing parameter names, empty if all required params present
 */
export function validateRequiredParameters(
  toolDefinition: ToolDefinition,
  parameters: Record<string, string>
): string[] {
  const missing: string[] = [];

  for (const paramDef of toolDefinition.parameters) {
    if (!parameters[paramDef.name]) {
      missing.push(paramDef.name);
    }
  }

  return missing;
}

/**
 * Format a tool execution result for display
 * @param result - Tool execution result
 * @returns Formatted string for logging
 */
export function formatExecutionResult(result: ToolExecutionResult): string {
  const lines: string[] = [];

  lines.push(`Exit Code: ${result.exitCode} (${result.success ? 'Success' : 'Failed'})`);

  if (result.stdout) {
    lines.push('--- STDOUT ---');
    lines.push(result.stdout);
  }

  if (result.stderr) {
    lines.push('--- STDERR ---');
    lines.push(result.stderr);
  }

  return lines.join('\n');
}