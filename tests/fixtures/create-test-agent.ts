/**
 * Utility to create test agent fixtures
 * Tests should use this instead of depending on examples/
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface TestAgentConfig {
  name: string;
  llm?: {
    model?: string;
    temperature?: number;
  };
  tools?: Array<{
    name: string;
    command: string[];
    description?: string;
    parameters?: any[];
  }>;
  hooks?: any;
}

/**
 * Create a minimal test agent with basic configuration
 */
export async function createTestAgent(
  agentDir: string,
  config?: Partial<TestAgentConfig>
): Promise<string> {
  await fs.mkdir(agentDir, { recursive: true });

  const agentConfig: TestAgentConfig = {
    name: config?.name || 'test-agent',
    llm: {
      model: config?.llm?.model || 'gpt-4',
      temperature: config?.llm?.temperature || 0.7,
    },
    tools: config?.tools || [
      {
        name: 'echo',
        command: ['echo'],
        description: 'Echo a message',
        parameters: [
          {
            name: 'message',
            type: 'string',
            description: 'Message to echo',
            inject_as: 'argument',
          },
        ],
      },
    ],
  };

  // Add hooks if provided
  if (config?.hooks) {
    (agentConfig as any).lifecycle_hooks = config.hooks;
  }

  // Write config.yaml
  const llmModel = agentConfig.llm?.model || 'gpt-4';
  const llmTemp = agentConfig.llm?.temperature ?? 0.7;
  const tools = agentConfig.tools || [];

  const configYaml = `name: ${agentConfig.name}
llm:
  model: ${llmModel}
  temperature: ${llmTemp}

tools:
${tools
  .map(
    (tool) => `  - name: ${tool.name}
    command: ${JSON.stringify(tool.command)}
    ${tool.description ? `description: ${tool.description}` : ''}
    ${
      tool.parameters
        ? `parameters:
${tool.parameters
  .map(
    (p) => `      - name: ${p.name}
        type: ${p.type}
        ${p.description ? `description: ${p.description}` : ''}
        inject_as: ${p.inject_as}
        ${p.option_name ? `option_name: ${p.option_name}` : ''}`
  )
  .join('\n')}`
        : ''
    }`
  )
  .join('\n')}

${
  (agentConfig as any).lifecycle_hooks
    ? `lifecycle_hooks:
${Object.entries((agentConfig as any).lifecycle_hooks)
  .map(
    ([key, value]: [string, any]) => `  ${key}:
    command: ${JSON.stringify(value.command)}`
  )
  .join('\n')}`
    : ''
}
`;

  await fs.writeFile(path.join(agentDir, 'config.yaml'), configYaml, 'utf-8');

  // Write system_prompt.md
  await fs.writeFile(
    path.join(agentDir, 'system_prompt.md'),
    `# ${agentConfig.name}\n\nA test agent for integration testing.`,
    'utf-8'
  );

  return agentDir;
}
