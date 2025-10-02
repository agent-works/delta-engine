/**
 * Key Codes Mapping
 * Maps semantic key names to their terminal control sequences
 */

/**
 * Complete mapping of key names to control sequences
 */
export const KEY_CODES: Record<string, string> = {
  // ============================================
  // Navigation Keys
  // ============================================
  arrow_up: '\x1b[A',
  arrow_down: '\x1b[B',
  arrow_right: '\x1b[C',
  arrow_left: '\x1b[D',

  // ============================================
  // Confirmation Keys
  // ============================================
  enter: '\n',
  tab: '\t',
  escape: '\x1b',
  space: ' ',
  backspace: '\x7f',

  // ============================================
  // Control Keys (Ctrl+A through Ctrl+Z)
  // ============================================
  'ctrl+a': '\x01', // Start of line
  'ctrl+b': '\x02', // Back one character
  'ctrl+c': '\x03', // Interrupt
  'ctrl+d': '\x04', // EOF / Delete character
  'ctrl+e': '\x05', // End of line
  'ctrl+f': '\x06', // Forward one character
  'ctrl+g': '\x07', // Bell
  'ctrl+h': '\x08', // Backspace
  'ctrl+i': '\x09', // Tab (same as \t)
  'ctrl+j': '\x0a', // Newline (same as \n)
  'ctrl+k': '\x0b', // Kill line
  'ctrl+l': '\x0c', // Clear screen
  'ctrl+m': '\x0d', // Carriage return
  'ctrl+n': '\x0e', // Next line
  'ctrl+o': '\x0f', // Omitted
  'ctrl+p': '\x10', // Previous line
  'ctrl+q': '\x11', // Resume output
  'ctrl+r': '\x12', // Reverse search
  'ctrl+s': '\x13', // Stop output
  'ctrl+t': '\x14', // Transpose characters
  'ctrl+u': '\x15', // Kill to beginning of line
  'ctrl+v': '\x16', // Literal next
  'ctrl+w': '\x17', // Kill word
  'ctrl+x': '\x18', // Prefix key
  'ctrl+y': '\x19', // Yank
  'ctrl+z': '\x1a', // Suspend

  // ============================================
  // Function Keys (F1-F12)
  // ============================================
  f1: '\x1bOP',
  f2: '\x1bOQ',
  f3: '\x1bOR',
  f4: '\x1bOS',
  f5: '\x1b[15~',
  f6: '\x1b[17~',
  f7: '\x1b[18~',
  f8: '\x1b[19~',
  f9: '\x1b[20~',
  f10: '\x1b[21~',
  f11: '\x1b[23~',
  f12: '\x1b[24~',

  // ============================================
  // Editing Keys
  // ============================================
  home: '\x1b[H',
  end: '\x1b[F',
  page_up: '\x1b[5~',
  page_down: '\x1b[6~',
  delete: '\x1b[3~',
  insert: '\x1b[2~',
};

/**
 * Get all supported key names
 */
export function getSupportedKeys(): string[] {
  return Object.keys(KEY_CODES).sort();
}

/**
 * Check if a key name is valid
 */
export function isValidKey(keyName: string): boolean {
  return keyName in KEY_CODES;
}

/**
 * Get the control sequence for a key name
 * @throws {Error} if key name is invalid
 */
export function getKeyCode(keyName: string): string {
  if (!isValidKey(keyName)) {
    throw new Error(
      `Invalid key name: ${keyName}. Supported keys: ${getSupportedKeys().join(', ')}`
    );
  }
  return KEY_CODES[keyName]!;
}

/**
 * Key categories for documentation and help
 */
export const KEY_CATEGORIES = {
  navigation: ['arrow_up', 'arrow_down', 'arrow_left', 'arrow_right'],
  confirmation: ['enter', 'tab', 'escape', 'space', 'backspace'],
  control: [
    'ctrl+a',
    'ctrl+b',
    'ctrl+c',
    'ctrl+d',
    'ctrl+e',
    'ctrl+f',
    'ctrl+g',
    'ctrl+h',
    'ctrl+i',
    'ctrl+j',
    'ctrl+k',
    'ctrl+l',
    'ctrl+m',
    'ctrl+n',
    'ctrl+o',
    'ctrl+p',
    'ctrl+q',
    'ctrl+r',
    'ctrl+s',
    'ctrl+t',
    'ctrl+u',
    'ctrl+v',
    'ctrl+w',
    'ctrl+x',
    'ctrl+y',
    'ctrl+z',
  ],
  function: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'],
  editing: ['home', 'end', 'page_up', 'page_down', 'delete', 'insert'],
};
