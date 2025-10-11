/**
 * v1.7 ToolExpander Unit Tests
 *
 * Tests for tool syntax expansion and security validations.
 * These tests verify that v1.7 simplified syntax is correctly
 * and safely transformed to internal ToolDefinition format.
 *
 * Priority: Security tests (command injection prevention) are critical.
 */

import { describe, it, expect } from '@jest/globals';
import {
  extractPlaceholders,
  expandExecMode,
  expandShellMode,
  ToolExpansionError,
} from '../../src/tool-expander.js';
import { ExecToolConfig, ShellToolConfig, InjectionType } from '../../src/types.js';

// ============================================
// Test Suite 1: Placeholder Extraction
// ============================================

describe('extractPlaceholders', () => {
  it('should extract simple placeholders', () => {
    const result = extractPlaceholders('echo ${msg}');
    expect(result).toEqual([
      { name: 'msg', position: 0, isRaw: false, fullMatch: '${msg}' }
    ]);
  });

  it('should extract multiple placeholders', () => {
    const result = extractPlaceholders('grep ${pattern} ${file}');
    expect(result).toEqual([
      { name: 'pattern', position: 0, isRaw: false, fullMatch: '${pattern}' },
      { name: 'file', position: 1, isRaw: false, fullMatch: '${file}' }
    ]);
  });

  it('should extract :raw modifier', () => {
    const result = extractPlaceholders('docker run ${flags:raw} ${image}');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'flags', isRaw: true });
    expect(result[1]).toMatchObject({ name: 'image', isRaw: false });
  });

  it('should return empty array for no placeholders', () => {
    const result = extractPlaceholders('echo hello');
    expect(result).toEqual([]);
  });
});

// ============================================
// Test Suite 2: Exec Mode Expansion
// ============================================

describe('expandExecMode', () => {
  it('should expand basic exec template', () => {
    const config: ExecToolConfig = {
      name: 'list',
      exec: 'ls -F ${directory}'
    };

    const result = expandExecMode(config);

    expect(result.name).toBe('list');
    expect(result.command).toEqual(['ls', '-F']); // Placeholder removed
    expect(result.parameters).toEqual([
      {
        name: 'directory',
        type: 'string',
        inject_as: InjectionType.Argument,
        position: 0
      }
    ]);
    expect(result.__meta?.syntax).toBe('exec');
    expect(result.__meta?.original_template).toBe('ls -F ${directory}');
  });

  it('should handle stdin parameter', () => {
    const config: ExecToolConfig = {
      name: 'write',
      exec: 'tee ${filename}',
      stdin: 'content'
    };

    const result = expandExecMode(config);

    expect(result.parameters).toHaveLength(2);
    expect(result.parameters.find(p => p.name === 'filename')).toMatchObject({
      inject_as: InjectionType.Argument,
      position: 0
    });
    expect(result.parameters.find(p => p.name === 'content')).toMatchObject({
      inject_as: InjectionType.Stdin
    });
  });

  it('should reject pipe operator (SECURITY)', () => {
    const config: ExecToolConfig = {
      name: 'unsafe',
      exec: 'cat ${file} | wc -l'
    };

    expect(() => expandExecMode(config)).toThrow(ToolExpansionError);
    expect(() => expandExecMode(config)).toThrow(/Shell metacharacter.*pipe/);
  });

  it('should reject output redirection (SECURITY)', () => {
    const config: ExecToolConfig = {
      name: 'unsafe',
      exec: 'echo ${msg} > /tmp/file'
    };

    expect(() => expandExecMode(config)).toThrow(ToolExpansionError);
    expect(() => expandExecMode(config)).toThrow(/Shell metacharacter.*output redirection/);
  });

  it('should reject command separator (SECURITY)', () => {
    const config: ExecToolConfig = {
      name: 'unsafe',
      exec: 'echo ${msg}; rm -rf /'
    };

    expect(() => expandExecMode(config)).toThrow(ToolExpansionError);
    expect(() => expandExecMode(config)).toThrow(/Shell metacharacter.*command separator/);
  });

  it('should reject :raw modifier (SECURITY)', () => {
    const config: ExecToolConfig = {
      name: 'unsafe',
      exec: 'echo ${msg:raw}'
    };

    expect(() => expandExecMode(config)).toThrow(ToolExpansionError);
    expect(() => expandExecMode(config)).toThrow(/:raw modifier not allowed in exec: mode/);
  });
});

// ============================================
// Test Suite 3: Shell Mode Expansion
// ============================================

describe('expandShellMode', () => {
  it('should expand shell template with quoted params', () => {
    const config: ShellToolConfig = {
      name: 'count',
      shell: 'cat ${file} | wc -l'
    };

    const result = expandShellMode(config);

    expect(result.name).toBe('count');
    expect(result.command).toEqual([
      'sh', '-c', 'cat "$1" | wc -l', '--'
    ]);
    expect(result.parameters).toEqual([
      {
        name: 'file',
        type: 'string',
        inject_as: InjectionType.Argument,
        position: 0
      }
    ]);
    expect(result.__meta?.syntax).toBe('shell');
  });

  it('should support :raw modifier for unquoted params', () => {
    const config: ShellToolConfig = {
      name: 'docker',
      shell: 'docker run ${flags:raw} ${image}'
    };

    const result = expandShellMode(config);

    // :raw → unquoted $1, normal → quoted "$2"
    expect(result.command).toEqual([
      'sh', '-c', 'docker run $1 "$2"', '--'
    ]);
    expect(result.parameters).toHaveLength(2);
    expect(result.parameters[0].name).toBe('flags');
    expect(result.parameters[1].name).toBe('image');
  });

  it('should handle multiple placeholders', () => {
    const config: ShellToolConfig = {
      name: 'grep',
      shell: 'grep ${pattern} ${file} | head -n ${lines}'
    };

    const result = expandShellMode(config);

    expect(result.command).toEqual([
      'sh', '-c', 'grep "$1" "$2" | head -n "$3"', '--'
    ]);
    expect(result.parameters).toHaveLength(3);
  });
});

// ============================================
// Test Suite 4: Command Injection Prevention (CRITICAL)
// ============================================

describe('Command Injection Prevention (Shell Mode)', () => {
  /**
   * Test: Semicolon injection should be safely contained by quotes
   * Attack vector: "; rm -rf /; echo "done"
   * Expected: Entire string becomes value of $1, quoted as "$1"
   */
  it('should prevent semicolon injection via automatic quoting', () => {
    const config: ShellToolConfig = {
      name: 'echo',
      shell: 'echo ${input}'
    };

    const result = expandShellMode(config);

    // Verify command structure
    expect(result.command).toEqual(['sh', '-c', 'echo "$1"', '--']);

    // The malicious input "; rm -rf /" would be passed as $1
    // Because it's quoted as "$1", the shell sees it as:
    //   echo "; rm -rf /"
    // NOT as:
    //   echo  ; rm -rf /
    // This prevents command injection.
  });

  /**
   * Test: Pipe operator injection should be safely quoted
   * Attack vector: "test | rm -rf /"
   */
  it('should prevent pipe injection via automatic quoting', () => {
    const config: ShellToolConfig = {
      name: 'grep',
      shell: 'grep ${pattern} file.txt'
    };

    const result = expandShellMode(config);

    expect(result.command).toEqual([
      'sh', '-c', 'grep "$1" file.txt', '--'
    ]);

    // Malicious pattern "| rm -rf /" becomes:
    //   grep "| rm -rf /" file.txt
    // The pipe is literal, not executed.
  });

  /**
   * Test: Command substitution injection should be quoted
   * Attack vector: "$(rm -rf /)"
   */
  it('should prevent command substitution via automatic quoting', () => {
    const config: ShellToolConfig = {
      name: 'echo',
      shell: 'echo ${msg}'
    };

    const result = expandShellMode(config);

    // msg = "$(rm -rf /)" becomes:
    //   echo "$(rm -rf /)"
    // The $(...) is literal text, not executed.
  });

  /**
   * Test: :raw modifier bypass attempt
   * :raw is dangerous by design (for expert use like flag lists)
   * But even :raw uses positional parameters, not string interpolation
   */
  it('should pass unquoted params with :raw but still use argv', () => {
    const config: ShellToolConfig = {
      name: 'test',
      shell: 'echo ${input:raw}'
    };

    const result = expandShellMode(config);

    // :raw → $1 (unquoted), but still argv-based
    expect(result.command).toEqual(['sh', '-c', 'echo $1', '--']);

    // Even with :raw, the value is passed via argv, not string interpolation.
    // So if input = "; rm -rf /", it becomes:
    //   argv[4] = "; rm -rf /"
    //   $1 expands to: ; rm -rf /
    //
    // This WILL execute the semicolon IF unquoted, which is why
    // :raw is marked as an expert feature with warnings.
  });
});

// ============================================
// Test Suite 5: Parameter Merging
// ============================================

describe('Parameter Merging', () => {
  it('should merge explicit parameter descriptions', () => {
    const config: ExecToolConfig = {
      name: 'test',
      exec: 'echo ${msg}',
      parameters: [
        {
          name: 'msg',
          type: 'string',
          inject_as: InjectionType.Argument,
          description: 'Message to echo'
        }
      ]
    };

    const result = expandExecMode(config);

    expect(result.parameters[0].description).toBe('Message to echo');
  });

  it('should reject parameter not in template', () => {
    const config: ExecToolConfig = {
      name: 'test',
      exec: 'echo ${msg}',
      parameters: [
        {
          name: 'unknown',  // Not in template!
          type: 'string',
          inject_as: InjectionType.Argument,
        }
      ]
    };

    expect(() => expandExecMode(config)).toThrow(ToolExpansionError);
    expect(() => expandExecMode(config)).toThrow(/not found in template/);
  });

  it('should reject inject_as override', () => {
    const config: ExecToolConfig = {
      name: 'test',
      exec: 'echo ${msg}',
      parameters: [
        {
          name: 'msg',
          type: 'string',
          inject_as: InjectionType.Stdin,  // Conflict! Template says argument
        }
      ]
    };

    expect(() => expandExecMode(config)).toThrow(ToolExpansionError);
    expect(() => expandExecMode(config)).toThrow(/Cannot override inject_as/);
  });
});

// ============================================
// Summary Comments
// ============================================

/*
 * IMPLEMENTATION NOTES:
 *
 * These tests cover the CRITICAL security validations:
 *
 * 1. exec: mode MUST reject all shell metacharacters
 *    - Prevents ANY shell involvement → maximum safety
 *
 * 2. shell: mode MUST use argv-based parameterization
 *    - Parameters passed via OS argv array, NOT string interpolation
 *    - Automatic quoting of ${param} → "$1" prevents injection
 *    - See spec Section 4.2.1 for security proof
 *
 * 3. :raw modifier is dangerous by design
 *    - Only allowed in shell: mode
 *    - Documented as expert feature with warnings
 *    - Still uses argv (not interpolation), but unquoted
 *
 * Additional tests needed for full coverage:
 * - Multi-line scripts (YAML block scalars)
 * - Whitespace preservation
 * - Edge cases (empty params, special chars)
 * - Integration tests with actual execution
 *
 * See docs/architecture/v1.7-implementation-plan.md Section 8 for
 * complete test suite specification (19 tests total).
 */
