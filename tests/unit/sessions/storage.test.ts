import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  saveMetadata,
  loadMetadata,
  updateMetadata,
  listSessionDirs,
  sessionExists,
  removeSessionDir,
} from '../../../src/sessions/storage.js';
import type { SessionMetadata } from '../../../src/sessions/types.js';

describe('storage', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `test-sessions-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('saveMetadata and loadMetadata', () => {
    it('should save and load session metadata', async () => {
      const sessionDir = path.join(testDir, 'sess_test123');
      const metadata: SessionMetadata = {
        session_id: 'sess_test123',
        command: ['bash', '-i'],
        pid: 12345,
        holder_pid: 12344,
        created_at: '2025-10-01T10:00:00Z',
        last_accessed_at: '2025-10-01T10:00:00Z',
        status: 'running',
      };

      await saveMetadata(sessionDir, metadata);

      const loaded = await loadMetadata(sessionDir);
      expect(loaded).toEqual(metadata);
    });

    it('should create directory if not exists', async () => {
      const sessionDir = path.join(testDir, 'sess_new');
      const metadata: SessionMetadata = {
        session_id: 'sess_new',
        command: ['bash'],
        pid: 999,
        holder_pid: 998,
        created_at: '2025-10-01T10:00:00Z',
        last_accessed_at: '2025-10-01T10:00:00Z',
        status: 'running',
      };

      await saveMetadata(sessionDir, metadata);

      const stat = await fs.stat(sessionDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should save metadata file with proper format', async () => {
      const sessionDir = path.join(testDir, 'sess_test456');
      const metadata: SessionMetadata = {
        session_id: 'sess_test456',
        command: ['bash'],
        pid: 54321,
        holder_pid: 54320,
        created_at: '2025-10-01T10:00:00Z',
        last_accessed_at: '2025-10-01T10:00:00Z',
        status: 'running',
      };

      await saveMetadata(sessionDir, metadata);

      const metadataContent = await fs.readFile(path.join(sessionDir, 'metadata.json'), 'utf-8');
      const parsed = JSON.parse(metadataContent);
      expect(parsed.pid).toBe(54321);
      expect(parsed.holder_pid).toBe(54320);
    });

    it('should throw error if metadata not found', async () => {
      const sessionDir = path.join(testDir, 'nonexistent');
      await expect(loadMetadata(sessionDir)).rejects.toThrow();
    });
  });

  describe('updateMetadata', () => {
    it('should update session metadata', async () => {
      const sessionDir = path.join(testDir, 'sess_update');
      const metadata: SessionMetadata = {
        session_id: 'sess_update',
        command: ['bash'],
        pid: 111,
        holder_pid: 110,
        created_at: '2025-10-01T10:00:00Z',
        last_accessed_at: '2025-10-01T10:00:00Z',
        status: 'running',
      };

      await saveMetadata(sessionDir, metadata);

      await updateMetadata(sessionDir, {
        status: 'dead',
        last_accessed_at: '2025-10-01T11:00:00Z',
      });

      const updated = await loadMetadata(sessionDir);
      expect(updated.status).toBe('dead');
      expect(updated.last_accessed_at).toBe('2025-10-01T11:00:00Z');
      expect(updated.pid).toBe(111); // Other fields unchanged
    });

    it('should handle partial updates', async () => {
      const sessionDir = path.join(testDir, 'sess_partial');
      const metadata: SessionMetadata = {
        session_id: 'sess_partial',
        command: ['python3'],
        pid: 222,
        holder_pid: 221,
        created_at: '2025-10-01T10:00:00Z',
        last_accessed_at: '2025-10-01T10:00:00Z',
        status: 'running',
      };

      await saveMetadata(sessionDir, metadata);

      // Update only exit_code
      await updateMetadata(sessionDir, {
        status: 'dead',
        exit_code: 0,
      });

      const updated = await loadMetadata(sessionDir);
      expect(updated.status).toBe('dead');
      expect(updated.exit_code).toBe(0);
      expect(updated.command).toEqual(['python3']); // Original fields preserved
    });
  });

  describe('listSessionDirs', () => {
    it('should list session directories', async () => {
      await fs.mkdir(path.join(testDir, 'sess_1'));
      await fs.mkdir(path.join(testDir, 'sess_2'));
      await fs.mkdir(path.join(testDir, 'not_a_session'));

      const dirs = await listSessionDirs(testDir);

      expect(dirs).toHaveLength(2);
      expect(dirs).toContain('sess_1');
      expect(dirs).toContain('sess_2');
      expect(dirs).not.toContain('not_a_session');
    });

    it('should return empty array if directory not exists', async () => {
      const nonexistent = path.join(testDir, 'nonexistent');
      const dirs = await listSessionDirs(nonexistent);
      expect(dirs).toEqual([]);
    });

    it('should ignore files', async () => {
      await fs.mkdir(path.join(testDir, 'sess_dir'));
      await fs.writeFile(path.join(testDir, 'sess_file.txt'), 'test');

      const dirs = await listSessionDirs(testDir);

      expect(dirs).toHaveLength(1);
      expect(dirs).toContain('sess_dir');
    });

    it('should handle empty sessions directory', async () => {
      const dirs = await listSessionDirs(testDir);
      expect(dirs).toEqual([]);
    });
  });

  describe('sessionExists', () => {
    it('should return true if session exists', async () => {
      const sessionDir = path.join(testDir, 'sess_exists');
      await fs.mkdir(sessionDir);

      const exists = await sessionExists(testDir, 'sess_exists');
      expect(exists).toBe(true);
    });

    it('should return false if session does not exist', async () => {
      const exists = await sessionExists(testDir, 'sess_not_exists');
      expect(exists).toBe(false);
    });

    it('should return false if path is a file', async () => {
      await fs.writeFile(path.join(testDir, 'sess_file'), 'test');

      const exists = await sessionExists(testDir, 'sess_file');
      expect(exists).toBe(false);
    });

    it('should handle special characters in session ID', async () => {
      const sessionDir = path.join(testDir, 'sess_abc123_def456');
      await fs.mkdir(sessionDir);

      const exists = await sessionExists(testDir, 'sess_abc123_def456');
      expect(exists).toBe(true);
    });
  });

  describe('removeSessionDir', () => {
    it('should remove session directory', async () => {
      const sessionDir = path.join(testDir, 'sess_remove');
      await fs.mkdir(sessionDir);
      await fs.writeFile(path.join(sessionDir, 'test.txt'), 'test');

      await removeSessionDir(testDir, 'sess_remove');

      const exists = await sessionExists(testDir, 'sess_remove');
      expect(exists).toBe(false);
    });

    it('should not throw if directory does not exist', async () => {
      await expect(removeSessionDir(testDir, 'sess_not_exists')).resolves.not.toThrow();
    });

    it('should remove directory with nested contents', async () => {
      const sessionDir = path.join(testDir, 'sess_nested');
      const subdir = path.join(sessionDir, 'subdir');
      await fs.mkdir(subdir, { recursive: true });
      await fs.writeFile(path.join(subdir, 'file.txt'), 'content');

      await removeSessionDir(testDir, 'sess_nested');

      const exists = await sessionExists(testDir, 'sess_nested');
      expect(exists).toBe(false);
    });
  });
});
