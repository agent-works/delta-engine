import type { ChatCompletionTool } from 'openai/resources/chat/index.js';
import { ToolDefinition, InjectionType } from './types.js';

/**
 * Convert a single ToolDefinition to OpenAI's ChatCompletionTool format
 * @param tool - Delta Engine tool definition
 * @returns OpenAI ChatCompletionTool object
 */
export function convertSingleToolToOpenAISchema(tool: ToolDefinition): ChatCompletionTool {
  // Build properties object for function parameters
  const properties: Record<string, {
    type: string;
    description?: string;
  }> = {};

  // Build required parameters array
  const required: string[] = [];

  // Process each parameter
  for (const param of tool.parameters) {
    // Create property definition
    properties[param.name] = {
      type: param.type, // In MVP, this is always 'string'
      description: buildParameterDescription(param),
    };

    // All parameters are required in the current implementation
    required.push(param.name);
  }

  // Construct the OpenAI tool schema
  const openAITool: ChatCompletionTool = {
    type: 'function',
    function: {
      name: tool.name,
      description: buildToolDescription(tool),
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };

  return openAITool;
}

/**
 * Convert an array of ToolDefinitions to OpenAI's ChatCompletionTool format
 * @param tools - Array of Delta Engine tool definitions
 * @returns Array of OpenAI ChatCompletionTool objects
 */
export function convertToolsToOpenAISchema(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map(tool => convertSingleToolToOpenAISchema(tool));
}

/**
 * Build a description for a tool based on its definition
 * @param tool - Tool definition
 * @returns Tool description string
 */
function buildToolDescription(tool: ToolDefinition): string {
  const commandStr = tool.command.join(' ');

  // Basic description including the command
  let description = `Executes the command: ${commandStr}`;

  // Add parameter injection information if parameters exist
  if (tool.parameters.length > 0) {
    const paramDescriptions = tool.parameters.map(param => {
      const injectionType = getInjectionTypeDescription(param.inject_as);
      return `${param.name} (${injectionType})`;
    });

    description += `. Parameters: ${paramDescriptions.join(', ')}`;
  }

  return description;
}

/**
 * Build a description for a parameter based on its injection type
 * @param param - Tool parameter
 * @returns Parameter description string
 */
function buildParameterDescription(param: {
  name: string;
  type: string;
  inject_as: InjectionType;
  option_name?: string;
}): string {
  switch (param.inject_as) {
    case InjectionType.Argument:
      return `Command line argument passed at the end of the command`;

    case InjectionType.Option:
      return `Command line option passed as ${param.option_name || '--' + param.name} followed by the value`;

    case InjectionType.Stdin:
      return `Input passed via standard input (stdin) to the command`;

    default:
      return `Parameter ${param.name}`;
  }
}

/**
 * Get a human-readable description of an injection type
 * @param injectionType - The injection type
 * @returns Human-readable description
 */
function getInjectionTypeDescription(injectionType: InjectionType): string {
  switch (injectionType) {
    case InjectionType.Argument:
      return 'argument';
    case InjectionType.Option:
      return 'option';
    case InjectionType.Stdin:
      return 'stdin';
    default:
      return 'unknown';
  }
}

/**
 * Validate that a tool schema is properly formed
 * @param schema - OpenAI tool schema to validate
 * @returns True if valid, throws error if invalid
 */
export function validateOpenAIToolSchema(schema: ChatCompletionTool): boolean {
  if (schema.type !== 'function') {
    throw new Error('Tool schema type must be "function"');
  }

  if (!schema.function) {
    throw new Error('Tool schema must have a function property');
  }

  if (!schema.function.name) {
    throw new Error('Tool function must have a name');
  }

  if (!schema.function.parameters) {
    throw new Error('Tool function must have parameters');
  }

  if (schema.function.parameters.type !== 'object') {
    throw new Error('Tool function parameters type must be "object"');
  }

  return true;
}

/**
 * Extract tool names from an array of OpenAI tool schemas
 * @param schemas - Array of OpenAI tool schemas
 * @returns Array of tool names
 */
export function extractToolNames(schemas: ChatCompletionTool[]): string[] {
  return schemas.map(schema => schema.function.name);
}