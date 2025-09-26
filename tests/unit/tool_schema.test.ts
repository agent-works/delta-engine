import type { ChatCompletionTool } from 'openai/resources/chat/index.js';
import {
  convertSingleToolToOpenAISchema,
  convertToolsToOpenAISchema,
  validateOpenAIToolSchema,
  extractToolNames,
} from '../../src/tool_schema.js';
import { ToolDefinition, InjectionType } from '../../src/types.js';

describe('Tool Schema Conversion', () => {
  describe('convertSingleToolToOpenAISchema', () => {
    it('should convert a simple tool with no parameters', () => {
      const tool: ToolDefinition = {
        name: 'list_files',
        command: ['ls', '-la'],
        parameters: [],
      };

      const schema = convertSingleToolToOpenAISchema(tool);

      expect(schema.type).toBe('function');
      expect(schema.function.name).toBe('list_files');
      expect(schema.function.description).toContain('ls -la');
      expect(schema.function.parameters).toEqual({
        type: 'object',
        properties: {},
        required: [],
      });
    });

    it('should convert a tool with argument parameter', () => {
      const tool: ToolDefinition = {
        name: 'echo_message',
        command: ['echo'],
        parameters: [
          {
            name: 'message',
            type: 'string',
            inject_as: InjectionType.Argument,
          },
        ],
      };

      const schema = convertSingleToolToOpenAISchema(tool);

      expect(schema.function.name).toBe('echo_message');
      expect(schema.function.parameters.properties).toHaveProperty('message');
      expect(schema.function.parameters.properties.message).toEqual({
        type: 'string',
        description: expect.stringContaining('argument'),
      });
      expect(schema.function.parameters.required).toContain('message');
    });

    it('should convert a tool with option parameter', () => {
      const tool: ToolDefinition = {
        name: 'grep_pattern',
        command: ['grep'],
        parameters: [
          {
            name: 'pattern',
            type: 'string',
            inject_as: InjectionType.Option,
            option_name: '--pattern',
          },
        ],
      };

      const schema = convertSingleToolToOpenAISchema(tool);

      expect(schema.function.parameters.properties.pattern).toEqual({
        type: 'string',
        description: expect.stringContaining('--pattern'),
      });
    });

    it('should convert a tool with stdin parameter', () => {
      const tool: ToolDefinition = {
        name: 'process_input',
        command: ['cat'],
        parameters: [
          {
            name: 'content',
            type: 'string',
            inject_as: InjectionType.Stdin,
          },
        ],
      };

      const schema = convertSingleToolToOpenAISchema(tool);

      expect(schema.function.parameters.properties.content).toEqual({
        type: 'string',
        description: expect.stringContaining('stdin'),
      });
    });

    it('should handle multiple parameters with different injection types', () => {
      const tool: ToolDefinition = {
        name: 'complex_tool',
        command: ['tool'],
        parameters: [
          {
            name: 'config',
            type: 'string',
            inject_as: InjectionType.Option,
            option_name: '--config',
          },
          {
            name: 'target',
            type: 'string',
            inject_as: InjectionType.Argument,
          },
          {
            name: 'input',
            type: 'string',
            inject_as: InjectionType.Stdin,
          },
        ],
      };

      const schema = convertSingleToolToOpenAISchema(tool);

      expect(Object.keys(schema.function.parameters.properties)).toHaveLength(3);
      expect(schema.function.parameters.required).toHaveLength(3);
      expect(schema.function.parameters.required).toEqual(['config', 'target', 'input']);
    });

    it('should include command with ${AGENT_HOME} in description', () => {
      const tool: ToolDefinition = {
        name: 'run_script',
        command: ['${AGENT_HOME}/scripts/run.sh'],
        parameters: [],
      };

      const schema = convertSingleToolToOpenAISchema(tool);

      expect(schema.function.description).toContain('${AGENT_HOME}/scripts/run.sh');
    });
  });

  describe('convertToolsToOpenAISchema', () => {
    it('should convert an array of tools', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'tool1',
          command: ['cmd1'],
          parameters: [],
        },
        {
          name: 'tool2',
          command: ['cmd2'],
          parameters: [
            {
              name: 'param',
              type: 'string',
              inject_as: InjectionType.Argument,
            },
          ],
        },
      ];

      const schemas = convertToolsToOpenAISchema(tools);

      expect(schemas).toHaveLength(2);
      expect(schemas[0].function.name).toBe('tool1');
      expect(schemas[1].function.name).toBe('tool2');
    });

    it('should handle empty array', () => {
      const schemas = convertToolsToOpenAISchema([]);

      expect(schemas).toEqual([]);
    });
  });

  describe('validateOpenAIToolSchema', () => {
    it('should validate a correct schema', () => {
      const schema: ChatCompletionTool = {
        type: 'function',
        function: {
          name: 'test_tool',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      };

      expect(validateOpenAIToolSchema(schema)).toBe(true);
    });

    it('should throw error for invalid type', () => {
      const schema: any = {
        type: 'invalid',
        function: {
          name: 'test',
          parameters: { type: 'object' },
        },
      };

      expect(() => validateOpenAIToolSchema(schema)).toThrow('type must be "function"');
    });

    it('should throw error for missing function', () => {
      const schema: any = {
        type: 'function',
      };

      expect(() => validateOpenAIToolSchema(schema)).toThrow('must have a function property');
    });

    it('should throw error for missing name', () => {
      const schema: any = {
        type: 'function',
        function: {
          parameters: { type: 'object' },
        },
      };

      expect(() => validateOpenAIToolSchema(schema)).toThrow('must have a name');
    });

    it('should throw error for missing parameters', () => {
      const schema: any = {
        type: 'function',
        function: {
          name: 'test',
        },
      };

      expect(() => validateOpenAIToolSchema(schema)).toThrow('must have parameters');
    });

    it('should throw error for invalid parameters type', () => {
      const schema: any = {
        type: 'function',
        function: {
          name: 'test',
          parameters: {
            type: 'array',
          },
        },
      };

      expect(() => validateOpenAIToolSchema(schema)).toThrow('parameters type must be "object"');
    });
  });

  describe('extractToolNames', () => {
    it('should extract tool names from schemas', () => {
      const schemas: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'tool1',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
        {
          type: 'function',
          function: {
            name: 'tool2',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
      ];

      const names = extractToolNames(schemas);

      expect(names).toEqual(['tool1', 'tool2']);
    });

    it('should handle empty array', () => {
      const names = extractToolNames([]);

      expect(names).toEqual([]);
    });
  });

  describe('Integration tests', () => {
    it('should round-trip conversion maintaining all information', () => {
      const tool: ToolDefinition = {
        name: 'full_featured_tool',
        command: ['${AGENT_HOME}/bin/tool', '--verbose'],
        parameters: [
          {
            name: 'config_file',
            type: 'string',
            inject_as: InjectionType.Option,
            option_name: '--config',
          },
          {
            name: 'target_path',
            type: 'string',
            inject_as: InjectionType.Argument,
          },
        ],
      };

      const schema = convertSingleToolToOpenAISchema(tool);

      // Validate the schema
      expect(validateOpenAIToolSchema(schema)).toBe(true);

      // Check all parts are preserved
      expect(schema.function.name).toBe('full_featured_tool');
      expect(schema.function.description).toContain('${AGENT_HOME}/bin/tool --verbose');
      expect(schema.function.parameters?.properties).toHaveProperty('config_file');
      expect(schema.function.parameters?.properties).toHaveProperty('target_path');
      expect(schema.function.parameters?.required).toEqual(['config_file', 'target_path']);
    });

    it('should handle real-world tool definitions', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'write_file',
          command: ['tee'],
          parameters: [
            {
              name: 'filename',
              type: 'string',
              inject_as: InjectionType.Argument,
            },
            {
              name: 'content',
              type: 'string',
              inject_as: InjectionType.Stdin,
            },
          ],
        },
        {
          name: 'search_files',
          command: ['grep', '-r'],
          parameters: [
            {
              name: 'pattern',
              type: 'string',
              inject_as: InjectionType.Argument,
            },
            {
              name: 'directory',
              type: 'string',
              inject_as: InjectionType.Argument,
            },
          ],
        },
      ];

      const schemas = convertToolsToOpenAISchema(tools);

      expect(schemas).toHaveLength(2);

      // Validate all schemas
      schemas.forEach(schema => {
        expect(validateOpenAIToolSchema(schema)).toBe(true);
      });

      // Check specific tool conversions
      const writeFileSchema = schemas.find(s => s.function.name === 'write_file');
      expect(writeFileSchema?.function.parameters?.properties).toHaveProperty('filename');
      expect(writeFileSchema?.function.parameters?.properties).toHaveProperty('content');

      const searchSchema = schemas.find(s => s.function.name === 'search_files');
      expect(searchSchema?.function.parameters?.properties).toHaveProperty('pattern');
      expect(searchSchema?.function.parameters?.properties).toHaveProperty('directory');
    });
  });
});