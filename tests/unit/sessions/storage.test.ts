import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  saveMetadata,
  loadMetadata,
  updateMetadata,
  loadPid,
  saveIndex,
  loadIndex,
  addToIndex,
  removeFromIndex,
  updateIndexEntry,
  listSessionDirs,
  sessionExists,
  removeSessionDir,
} from '../../../src/sessions/storage.js';
import type { SessionMetadata, SessionIndex } from '../../../src/sessions/types.js';

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
        created_at: '2025-10-01T10:00:00Z',
        last_accessed_at: '2025-10-01T10:00:00Z',
        status: 'running',
        sessions_dir: testDir,
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
        created_at: '2025-10-01T10:00:00Z',
        last_accessed_at: '2025-10-01T10:00:00Z',
        status: 'running',
        sessions_dir: testDir,
      };

      await saveMetadata(sessionDir, metadata);

      const stat = await fs.stat(sessionDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should save pid file', async () => {
      const sessionDir = path.join(testDir, 'sess_test456');
      const metadata: SessionMetadata = {
        session_id: 'sess_test456',
        command: ['bash'],
        pid: 54321,
        created_at: '2025-10-01T10:00:00Z',
        last_accessed_at: '2025-10-01T10:00:00Z',
        status: 'running',
        sessions_dir: testDir,
      };

      await saveMetadata(sessionDir, metadata);

      const pidContent = await fs.readFile(path.join(sessionDir, 'pid'), 'utf-8');
      expect(pidContent).toBe('54321');
    });

    it('should throw error if metadata not found', async () => {
      const sessionDir = path.join(testDir, 'nonexistent');
      await expect(loadMetadata(sessionDir)).rejects.toThrow('Session metadata not found');
    });
  });

  describe('updateMetadata', () => {
    it('should update session metadata', async () => {
      const sessionDir = path.join(testDir, 'sess_update');
      const metadata: SessionMetadata = {
        session_id: 'sess_update',
        command: ['bash'],
        pid: 111,
        created_at: '2025-10-01T10:00:00Z',
        last_accessed_at: '2025-10-01T10:00:00Z',
        status: 'running',
        sessions_dir: testDir,
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
  });

  describe('loadPid', () => {
    it('should load PID from pid file', async () => {
      const sessionDir = path.join(testDir, 'sess_pid');
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(path.join(sessionDir, 'pid'), '99999', 'utf-8');

      const pid = await loadPid(sessionDir);
      expect(pid).toBe(99999);
    });

    it('should handle whitespace in pid file', async () => {
      const sessionDir = path.join(testDir, 'sess_pid_ws');
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(path.join(sessionDir, 'pid'), '  12345  \n', 'utf-8');

      const pid = await loadPid(sessionDir);
      expect(pid).toBe(12345);
    });
  });

  describe('saveIndex and loadIndex', () => {
    it('should save and load session index', async () => {
      const index: SessionIndex = {
        sessions: [
          {
            session_id: 'sess_1',
            command: 'bash -i',
            status: 'running',
            created_at: '2025-10-01T10:00:00Z',
          },
          {
            session_id: 'sess_2',
            command: 'ssh user@host',
            status: 'running',
            created_at: '2025-10-01T10:05:00Z',
          },
        ],
        last_cleanup_at: '2025-10-01T09:00:00Z',
      };

      await saveIndex(testDir, index);
      const loaded = await loadIndex(testDir);

      expect(loaded).toEqual(index);
    });

    it('should return empty index if file not exists', async () => {
      const loaded = await loadIndex(testDir);
      expect(loaded).toEqual({ sessions: [] });
    });
  });

  describe('addToIndex', () => {
    it('should add new session to index', async () => {
      const sessionInfo = {
        session_id: 'sess_add',
        command: 'bash',
        status: 'running' as const,
        created_at: '2025-10-01T10:00:00Z',
      };

      await addToIndex(testDir, sessionInfo);

      const index = await loadIndex(testDir);
      expect(index.sessions).toHaveLength(1);
      expect(index.sessions[0]).toEqual(sessionInfo);
    });

    it('should update existing session in index', async () => {
      // Add first
      await addToIndex(testDir, {
        session_id: 'sess_dup',
        command: 'bash',
        status: 'running',
        created_at: '2025-10-01T10:00:00Z',
      });

      // Update
      await addToIndex(testDir, {
        session_id: 'sess_dup',
        command: 'bash',
        status: 'dead',
        created_at: '2025-10-01T10:00:00Z',
      });

      const index = await loadIndex(testDir);
      expect(index.sessions).toHaveLength(1);
      expect(index.sessions[0].status).toBe('dead');
    });
  });

  describe('removeFromIndex', () => {
    it('should remove session from index', async () => {
      await addToIndex(testDir, {
        session_id: 'sess_1',
        command: 'bash',
        status: 'running',
        created_at: '2025-10-01T10:00:00Z',
      });
      await addToIndex(testDir, {
        session_id: 'sess_2',
        command: 'ssh',
        status: 'running',
        created_at: '2025-10-01T10:05:00Z',
      });

      await removeFromIndex(testDir, 'sess_1');

      const index = await loadIndex(testDir);
      expect(index.sessions).toHaveLength(1);
      expect(index.sessions[0].session_id).toBe('sess_2');
    });

    it('should handle removing non-existent session', async () => {
      await addToIndex(testDir, {
        session_id: 'sess_exists',
        command: 'bash',
        status: 'running',
        created_at: '2025-10-01T10:00:00Z',
      });

      await removeFromIndex(testDir, 'sess_not_exists');

      const index = await loadIndex(testDir);
      expect(index.sessions).toHaveLength(1);
    });
  });

  describe('updateIndexEntry', () => {
    it('should update index entry', async () => {
      await addToIndex(testDir, {
        session_id: 'sess_update_idx',
        command: 'bash',
        status: 'running',
        created_at: '2025-10-01T10:00:00Z',
      });

      await updateIndexEntry(testDir, 'sess_update_idx', { status: 'dead' });

      const index = await loadIndex(testDir);
      expect(index.sessions[0].status).toBe('dead');
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
  });
});
