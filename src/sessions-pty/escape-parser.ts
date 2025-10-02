/**
 * Escape Sequence Parser
 * Parses escape sequences in input strings to actual control characters
 */

/**
 * Parse escape sequences in a string to their actual byte values
 *
 * Supported sequences:
 * - Standard escapes: \n, \r, \t, \b, \f, \v
 * - Hex escapes: \x1b (2-digit hex)
 * - Unicode escapes: \u001b (4-digit hex)
 * - Backslash escape: \\
 *
 * @param input - String containing escape sequences
 * @returns String with escape sequences converted to actual bytes
 *
 * @example
 * parseEscapeSequences('hello\\nworld')  // → "hello\nworld"
 * parseEscapeSequences('\\x1b[A')        // → "\x1b[A" (up arrow)
 * parseEscapeSequences('\\\\n')          // → "\\n" (literal backslash-n)
 */
export function parseEscapeSequences(input: string): string {
  let result = input;

  // Backslash escape FIRST (to avoid interfering with other escapes)
  // \\n should become \n (literal backslash followed by n), not newline
  result = result.replace(/\\\\/g, '\x00'); // Temporary placeholder

  // Standard escape sequences
  result = result.replace(/\\n/g, '\n');   // Newline
  result = result.replace(/\\r/g, '\r');   // Carriage return
  result = result.replace(/\\t/g, '\t');   // Tab
  result = result.replace(/\\b/g, '\b');   // Backspace
  result = result.replace(/\\f/g, '\f');   // Form feed
  result = result.replace(/\\v/g, '\v');   // Vertical tab

  // Hex escapes (\x1b)
  result = result.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // Unicode escapes (\u001b)
  result = result.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // Restore backslashes
  result = result.replace(/\x00/g, '\\');

  return result;
}

/**
 * Check if a string contains any escape sequences
 */
export function containsEscapeSequences(input: string): boolean {
  return /\\[nrtbfvxu\\]/.test(input);
}

/**
 * Escape special characters for display (reverse operation)
 * Useful for logging and debugging
 */
export function escapeForDisplay(input: string): string {
  return input
    .replace(/\\/g, '\\\\')   // Backslash
    .replace(/\n/g, '\\n')     // Newline
    .replace(/\r/g, '\\r')     // Carriage return
    .replace(/\t/g, '\\t')     // Tab
    .replace(/\x1b/g, '\\x1b') // Escape character
    .replace(/[\x00-\x1f]/g, (char) => {
      // Other control characters as hex
      const code = char.charCodeAt(0);
      return `\\x${code.toString(16).padStart(2, '0')}`;
    });
}
