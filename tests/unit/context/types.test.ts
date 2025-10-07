import { describe, it, expect } from '@jest/globals';
import {
  FileSourceSchema,
  ComputedFileSourceSchema,
  JournalSourceSchema,
  ContextSourceSchema,
  ContextManifestSchema,
  DEFAULT_MANIFEST,
} from '../../../src/context/types.js';

describe('Context Type Schemas', () => {
  describe('FileSourceSchema', () => {
    it('should validate valid file source', () => {
      const valid = {
        type: 'file',
        path: '/path/to/file.md',
      };

      expect(() => FileSourceSchema.parse(valid)).not.toThrow();
    });

    it('should apply default on_missing=error', () => {
      const source = {
        type: 'file',
        path: '/path/to/file.md',
      };

      const parsed = FileSourceSchema.parse(source);
      expect(parsed.on_missing).toBe('error');
    });

    it('should accept on_missing=skip', () => {
      const source = {
        type: 'file',
        path: '/path/to/file.md',
        on_missing: 'skip',
      };

      const parsed = FileSourceSchema.parse(source);
      expect(parsed.on_missing).toBe('skip');
    });

    it('should reject invalid on_missing value', () => {
      const invalid = {
        type: 'file',
        path: '/path/to/file.md',
        on_missing: 'invalid',
      };

      expect(() => FileSourceSchema.parse(invalid)).toThrow();
    });

    it('should require path field', () => {
      const invalid = {
        type: 'file',
      };

      expect(() => FileSourceSchema.parse(invalid)).toThrow();
    });

    it('should accept optional id field', () => {
      const source = {
        type: 'file',
        id: 'my_source',
        path: '/path/to/file.md',
      };

      const parsed = FileSourceSchema.parse(source);
      expect(parsed.id).toBe('my_source');
    });
  });

  describe('ComputedFileSourceSchema', () => {
    it('should validate valid computed_file source', () => {
      const valid = {
        type: 'computed_file',
        generator: {
          command: ['python3', 'script.py'],
        },
        output_path: '/tmp/output.md',
      };

      expect(() => ComputedFileSourceSchema.parse(valid)).not.toThrow();
    });

    it('should apply default timeout_ms=30000', () => {
      const source = {
        type: 'computed_file',
        generator: {
          command: ['python3', 'script.py'],
        },
        output_path: '/tmp/output.md',
      };

      const parsed = ComputedFileSourceSchema.parse(source);
      expect(parsed.generator.timeout_ms).toBe(30000);
    });

    it('should accept custom timeout_ms', () => {
      const source = {
        type: 'computed_file',
        generator: {
          command: ['python3', 'script.py'],
          timeout_ms: 60000,
        },
        output_path: '/tmp/output.md',
      };

      const parsed = ComputedFileSourceSchema.parse(source);
      expect(parsed.generator.timeout_ms).toBe(60000);
    });

    it('should reject empty command array', () => {
      const invalid = {
        type: 'computed_file',
        generator: {
          command: [],
        },
        output_path: '/tmp/output.md',
      };

      expect(() => ComputedFileSourceSchema.parse(invalid)).toThrow();
    });

    it('should reject negative timeout_ms', () => {
      const invalid = {
        type: 'computed_file',
        generator: {
          command: ['python3', 'script.py'],
          timeout_ms: -1000,
        },
        output_path: '/tmp/output.md',
      };

      expect(() => ComputedFileSourceSchema.parse(invalid)).toThrow();
    });

    it('should require output_path field', () => {
      const invalid = {
        type: 'computed_file',
        generator: {
          command: ['python3', 'script.py'],
        },
      };

      expect(() => ComputedFileSourceSchema.parse(invalid)).toThrow();
    });
  });

  describe('JournalSourceSchema', () => {
    it('should validate valid journal source', () => {
      const valid = {
        type: 'journal',
      };

      expect(() => JournalSourceSchema.parse(valid)).not.toThrow();
    });

    it('should accept optional max_iterations', () => {
      const source = {
        type: 'journal',
        max_iterations: 15,
      };

      const parsed = JournalSourceSchema.parse(source);
      expect(parsed.max_iterations).toBe(15);
    });

    it('should reject negative max_iterations', () => {
      const invalid = {
        type: 'journal',
        max_iterations: -5,
      };

      expect(() => JournalSourceSchema.parse(invalid)).toThrow();
    });

    it('should reject zero max_iterations', () => {
      const invalid = {
        type: 'journal',
        max_iterations: 0,
      };

      expect(() => JournalSourceSchema.parse(invalid)).toThrow();
    });
  });

  describe('ContextSourceSchema (Discriminated Union)', () => {
    it('should accept valid file source', () => {
      const source = {
        type: 'file',
        path: '/path/to/file.md',
      };

      expect(() => ContextSourceSchema.parse(source)).not.toThrow();
    });

    it('should accept valid computed_file source', () => {
      const source = {
        type: 'computed_file',
        generator: {
          command: ['echo', 'test'],
        },
        output_path: '/tmp/output.md',
      };

      expect(() => ContextSourceSchema.parse(source)).not.toThrow();
    });

    it('should accept valid journal source', () => {
      const source = {
        type: 'journal',
        max_iterations: 10,
      };

      expect(() => ContextSourceSchema.parse(source)).not.toThrow();
    });

    it('should reject invalid type', () => {
      const invalid = {
        type: 'invalid_type',
        path: '/path/to/file.md',
      };

      expect(() => ContextSourceSchema.parse(invalid)).toThrow();
    });
  });

  describe('ContextManifestSchema', () => {
    it('should validate valid manifest', () => {
      const valid = {
        sources: [
          {
            type: 'file',
            path: '/path/to/file.md',
          },
        ],
      };

      expect(() => ContextManifestSchema.parse(valid)).not.toThrow();
    });

    it('should accept multiple sources', () => {
      const manifest = {
        sources: [
          {
            type: 'file',
            path: '/path/to/file.md',
          },
          {
            type: 'computed_file',
            generator: {
              command: ['python3', 'script.py'],
            },
            output_path: '/tmp/output.md',
          },
          {
            type: 'journal',
            max_iterations: 15,
          },
        ],
      };

      const parsed = ContextManifestSchema.parse(manifest);
      expect(parsed.sources).toHaveLength(3);
    });

    it('should reject empty sources array', () => {
      const invalid = {
        sources: [],
      };

      expect(() => ContextManifestSchema.parse(invalid)).toThrow();
    });

    it('should reject missing sources field', () => {
      const invalid = {};

      expect(() => ContextManifestSchema.parse(invalid)).toThrow();
    });
  });

  describe('DEFAULT_MANIFEST', () => {
    it('should be a valid ContextManifest', () => {
      expect(() => ContextManifestSchema.parse(DEFAULT_MANIFEST)).not.toThrow();
    });

    it('should have 3 sources (always includes journal)', () => {
      expect(DEFAULT_MANIFEST.sources).toHaveLength(3);
    });

    it('should have system_prompt as first source', () => {
      const firstSource = DEFAULT_MANIFEST.sources[0];
      expect(firstSource?.type).toBe('file');
      expect((firstSource as any).path).toContain('system_prompt.md');
    });

    it('should have DELTA.md as second source with skip', () => {
      const secondSource = DEFAULT_MANIFEST.sources[1];
      expect(secondSource?.type).toBe('file');
      expect((secondSource as any).path).toContain('DELTA.md');
      expect((secondSource as any).on_missing).toBe('skip');
    });

    it('should ALWAYS have journal source as third source', () => {
      const thirdSource = DEFAULT_MANIFEST.sources[2];
      expect(thirdSource?.type).toBe('journal');
      expect((thirdSource as any).max_iterations).toBeUndefined(); // undefined = unlimited
    });
  });
});
