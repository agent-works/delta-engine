import { describe, it, expect } from '@jest/globals';
import {
  parseEscapeSequences,
  containsEscapeSequences,
  escapeForDisplay,
} from '../../../src/sessions-pty/escape-parser.js';

describe('escape-parser', () => {
  describe('parseEscapeSequences', () => {
    it('should parse newline', () => {
      expect(parseEscapeSequences('hello\\nworld')).toBe('hello\nworld');
    });

    it('should parse carriage return', () => {
      expect(parseEscapeSequences('hello\\rworld')).toBe('hello\rworld');
    });

    it('should parse tab', () => {
      expect(parseEscapeSequences('hello\\tworld')).toBe('hello\tworld');
    });

    it('should parse backspace', () => {
      expect(parseEscapeSequences('hello\\bworld')).toBe('hello\bworld');
    });

    it('should parse form feed', () => {
      expect(parseEscapeSequences('hello\\fworld')).toBe('hello\fworld');
    });

    it('should parse vertical tab', () => {
      expect(parseEscapeSequences('hello\\vworld')).toBe('hello\vworld');
    });

    it('should parse hex escape (lowercase)', () => {
      expect(parseEscapeSequences('\\x1b[A')).toBe('\x1b[A');
    });

    it('should parse hex escape (uppercase)', () => {
      expect(parseEscapeSequences('\\x1B[A')).toBe('\x1b[A');
    });

    it('should parse multiple hex escapes', () => {
      expect(parseEscapeSequences('\\x1b[A\\x1b[B')).toBe('\x1b[A\x1b[B');
    });

    it('should parse unicode escape', () => {
      expect(parseEscapeSequences('\\u001b[A')).toBe('\x1b[A');
    });

    it('should parse unicode escape (uppercase)', () => {
      expect(parseEscapeSequences('\\u001B[A')).toBe('\x1b[A');
    });

    it('should parse backslash escape', () => {
      expect(parseEscapeSequences('\\\\n')).toBe('\\n');
    });

    it('should parse double backslash', () => {
      expect(parseEscapeSequences('\\\\\\\\')).toBe('\\\\');
    });

    it('should handle mixed escapes', () => {
      const input = 'Line1\\nLine2\\tTab\\x1b[A';
      const expected = 'Line1\nLine2\tTab\x1b[A';
      expect(parseEscapeSequences(input)).toBe(expected);
    });

    it('should handle command with newline', () => {
      expect(parseEscapeSequences('ls -la\\n')).toBe('ls -la\n');
    });

    it('should handle arrow keys', () => {
      expect(parseEscapeSequences('\\x1b[A')).toBe('\x1b[A'); // Up
      expect(parseEscapeSequences('\\x1b[B')).toBe('\x1b[B'); // Down
      expect(parseEscapeSequences('\\x1b[C')).toBe('\x1b[C'); // Right
      expect(parseEscapeSequences('\\x1b[D')).toBe('\x1b[D'); // Left
    });

    it('should handle Ctrl+C', () => {
      expect(parseEscapeSequences('\\x03')).toBe('\x03');
    });

    it('should handle Ctrl+D', () => {
      expect(parseEscapeSequences('\\x04')).toBe('\x04');
    });

    it('should handle escape key', () => {
      expect(parseEscapeSequences('\\x1b')).toBe('\x1b');
    });

    it('should handle empty string', () => {
      expect(parseEscapeSequences('')).toBe('');
    });

    it('should handle string without escapes', () => {
      expect(parseEscapeSequences('hello world')).toBe('hello world');
    });

    it('should handle partial escape sequences (not valid)', () => {
      // Invalid hex (only 1 digit)
      expect(parseEscapeSequences('\\x1')).toBe('\\x1');
      // Invalid unicode (only 3 digits)
      expect(parseEscapeSequences('\\u001')).toBe('\\u001');
    });

    it('should preserve non-escape backslashes', () => {
      expect(parseEscapeSequences('\\q')).toBe('\\q');
      expect(parseEscapeSequences('\\z')).toBe('\\z');
    });
  });

  describe('containsEscapeSequences', () => {
    it('should detect newline', () => {
      expect(containsEscapeSequences('hello\\nworld')).toBe(true);
    });

    it('should detect hex escape', () => {
      expect(containsEscapeSequences('\\x1b[A')).toBe(true);
    });

    it('should detect unicode escape', () => {
      expect(containsEscapeSequences('\\u001b')).toBe(true);
    });

    it('should detect backslash escape', () => {
      expect(containsEscapeSequences('\\\\')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(containsEscapeSequences('hello world')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(containsEscapeSequences('')).toBe(false);
    });
  });

  describe('escapeForDisplay', () => {
    it('should escape newline', () => {
      expect(escapeForDisplay('hello\nworld')).toBe('hello\\nworld');
    });

    it('should escape carriage return', () => {
      expect(escapeForDisplay('hello\rworld')).toBe('hello\\rworld');
    });

    it('should escape tab', () => {
      expect(escapeForDisplay('hello\tworld')).toBe('hello\\tworld');
    });

    it('should escape escape character', () => {
      expect(escapeForDisplay('\x1b[A')).toBe('\\x1b[A');
    });

    it('should escape backslash', () => {
      expect(escapeForDisplay('hello\\world')).toBe('hello\\\\world');
    });

    it('should escape control characters as hex', () => {
      expect(escapeForDisplay('\x00')).toBe('\\x00');
      expect(escapeForDisplay('\x03')).toBe('\\x03');
      expect(escapeForDisplay('\x04')).toBe('\\x04');
    });

    it('should handle mixed content', () => {
      const input = 'Line1\nLine2\t\x1b[A';
      const expected = 'Line1\\nLine2\\t\\x1b[A';
      expect(escapeForDisplay(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(escapeForDisplay('')).toBe('');
    });

    it('should handle plain text', () => {
      expect(escapeForDisplay('hello world')).toBe('hello world');
    });

    it('should round-trip with parseEscapeSequences', () => {
      const original = 'hello\\nworld\\t\\x1b[A';
      const parsed = parseEscapeSequences(original);
      const escaped = escapeForDisplay(parsed);
      expect(escaped).toBe(original);
    });
  });
});
