import { describe, it, expect } from '@jest/globals';
import { parseToolCalls, hasToolCalls } from '../src/llm.js';
import type { ChatCompletionMessage } from 'openai/resources/chat/index.js';

describe('LLM Module', () => {
  describe('parseToolCalls', () => {
    it('should parse tool calls with valid arguments', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path": "/tmp/test.txt"}',
            },
          },
        ],
      };

      const result = parseToolCalls(message);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'call_123',
        name: 'read_file',
        arguments: { path: '/tmp/test.txt' },
      });
    });

    it('should handle undefined arguments for no-parameter tools', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_456',
            type: 'function',
            function: {
              name: 'list_files',
              arguments: undefined as any, // Some LLMs like Claude may return undefined
            },
          },
        ],
      };

      const result = parseToolCalls(message);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'call_456',
        name: 'list_files',
        arguments: {},
      });
    });

    it('should handle "undefined" string as arguments', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_789',
            type: 'function',
            function: {
              name: 'list_files',
              arguments: 'undefined', // String "undefined"
            },
          },
        ],
      };

      const result = parseToolCalls(message);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'call_789',
        name: 'list_files',
        arguments: {},
      });
    });

    it('should handle empty string arguments', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: {
              name: 'list_files',
              arguments: '',
            },
          },
        ],
      };

      const result = parseToolCalls(message);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'call_abc',
        name: 'list_files',
        arguments: {},
      });
    });

    it('should handle null arguments', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_def',
            type: 'function',
            function: {
              name: 'list_files',
              arguments: 'null',
            },
          },
        ],
      };

      const result = parseToolCalls(message);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'call_def',
        name: 'list_files',
        arguments: {},
      });
    });

    it('should return empty array when no tool calls', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: 'Just a text response',
      };

      const result = parseToolCalls(message);
      expect(result).toEqual([]);
    });

    it('should throw error for invalid JSON arguments', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_bad',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path": invalid json}',
            },
          },
        ],
      };

      expect(() => parseToolCalls(message)).toThrow(
        'Failed to parse tool call arguments for read_file'
      );
    });

    it('should handle multiple tool calls', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'list_files',
              arguments: 'undefined',
            },
          },
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path": "/tmp/test.txt"}',
            },
          },
        ],
      };

      const result = parseToolCalls(message);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'call_1',
        name: 'list_files',
        arguments: {},
      });
      expect(result[1]).toEqual({
        id: 'call_2',
        name: 'read_file',
        arguments: { path: '/tmp/test.txt' },
      });
    });
  });

  describe('hasToolCalls', () => {
    it('should return true when tool calls exist', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'test_tool',
              arguments: '{}',
            },
          },
        ],
      };

      expect(hasToolCalls(message)).toBe(true);
    });

    it('should return false when no tool calls', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: 'Just text',
      };

      expect(hasToolCalls(message)).toBe(false);
    });

    it('should return false when tool_calls array is empty', () => {
      const message: ChatCompletionMessage = {
        role: 'assistant',
        content: 'Text with empty tool calls',
        tool_calls: [],
      };

      expect(hasToolCalls(message)).toBe(false);
    });
  });
});