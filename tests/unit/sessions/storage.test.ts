import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionStorage } from '../../../src/sessions/storage.js';
import type { SessionMetadata, SessionState } from '../../../src/sessions/types.js';

/**
 * Unit tests for v1.5 SessionStorage (simplified command-based sessions)
 */
describe('SessionStorage (v1.5)', () => {
  let testDir: string;
  let storage: SessionStorage;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `test-sessions-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
    storage = new SessionStorage(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('saveMetadata and loadMetadata', () => {
    it('should save and load session metadata', async () => {
      const sessionId = 'sess_test123';
      const metadata: SessionMetadata = {
        session_id: sessionId,
        command: 'bash',
        created_at: '2025-10-01T10:00:00Z',
        last_executed_at: '2025-10-01T10:00:00Z',
        status: 'active',
        work_dir: '/tmp',
        execution_count: 0,
      };

      await storage.createSessionDir(sessionId);
      await storage.saveMetadata(metadata);

      const loaded = await storage.loadMetadata(sessionId);
      expect(loaded).toEqual(metadata);
    });

    it('should create directory if not exists', async () => {
      const sessionId = 'sess_new';
      const metadata: SessionMetadata = {
        session_id: sessionId,
        command: 'bash',
        created_at: '2025-10-01T10:00:00Z',
        status: 'active',
        work_dir: '/tmp',
        execution_count: 0,
      };

      await storage.createSessionDir(sessionId);
      await storage.saveMetadata(metadata);

      const sessionDir = storage.getSessionDir(sessionId);
      const stat = await fs.stat(sessionDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should save metadata file with proper format', async () => {
      const sessionId = 'sess_test456';
      const metadata: SessionMetadata = {
        session_id: sessionId,
        command: 'python3',
        created_at: '2025-10-01T10:00:00Z',
        status: 'active',
        work_dir: '/home/user',
        execution_count: 5,
      };

      await storage.createSessionDir(sessionId);
      await storage.saveMetadata(metadata);

      const sessionDir = storage.getSessionDir(sessionId);
      const metadataContent = await fs.readFile(path.join(sessionDir, 'metadata.json'), 'utf-8');
      const parsed = JSON.parse(metadataContent);
      expect(parsed.command).toBe('python3');
      expect(parsed.work_dir).toBe('/home/user');
      expect(parsed.execution_count).toBe(5);
    });

    it('should return null if metadata not found', async () => {
      const sessionId = 'sess_nonexistent';
      const metadata = await storage.loadMetadata(sessionId);
      expect(metadata).toBeNull();
    });
  });

  describe('saveState and loadState', () => {
    it('should save and load session state', async () => {
      const sessionId = 'sess_state123';
      const state: SessionState = {
        work_dir: '/tmp/test',
        env_vars: { PATH: '/usr/bin', HOME: '/home/user' },
      };

      await storage.createSessionDir(sessionId);
      await storage.saveState(sessionId, state);

      const loaded = await storage.loadState(sessionId);
      expect(loaded).toEqual(state);
    });

    it('should return null if state not found', async () => {
      const sessionId = 'sess_nostate';
      await storage.createSessionDir(sessionId);

      const state = await storage.loadState(sessionId);
      expect(state).toBeNull();
    });
  });

  describe('sessionExists', () => {
    it('should return true if session exists', async () => {
      const sessionId = 'sess_exists';
      const metadata: SessionMetadata = {
        session_id: sessionId,
        command: 'bash',
        created_at: '2025-10-01T10:00:00Z',
        status: 'active',
        work_dir: '/tmp',
        execution_count: 0,
      };

      await storage.createSessionDir(sessionId);
      await storage.saveMetadata(metadata);

      const exists = await storage.sessionExists(sessionId);
      expect(exists).toBe(true);
    });

    it('should return false if session does not exist', async () => {
      const exists = await storage.sessionExists('sess_not_exists');
      expect(exists).toBe(false);
    });
  });

  describe('listSessionIds', () => {
    it('should list all session IDs', async () => {
      const sessions = [
        {
          session_id: 'sess_1',
          command: 'bash',
          created_at: '2025-10-01T10:00:00Z',
          status: 'active' as const,
          work_dir: '/tmp',
          execution_count: 0,
        },
        {
          session_id: 'sess_2',
          command: 'python3',
          created_at: '2025-10-01T11:00:00Z',
          status: 'active' as const,
          work_dir: '/home',
          execution_count: 3,
        },
      ];

      for (const metadata of sessions) {
        await storage.createSessionDir(metadata.session_id);
        await storage.saveMetadata(metadata);
      }

      const list = await storage.listSessionIds();
      expect(list).toHaveLength(2);
      expect(list.sort()).toEqual(['sess_1', 'sess_2']);
    });

    it('should return empty array if no sessions', async () => {
      const list = await storage.listSessionIds();
      expect(list).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    it('should delete session directory', async () => {
      const sessionId = 'sess_delete';
      const metadata: SessionMetadata = {
        session_id: sessionId,
        command: 'bash',
        created_at: '2025-10-01T10:00:00Z',
        status: 'active',
        work_dir: '/tmp',
        execution_count: 0,
      };

      await storage.createSessionDir(sessionId);
      await storage.saveMetadata(metadata);

      await storage.deleteSession(sessionId);

      const exists = await storage.sessionExists(sessionId);
      expect(exists).toBe(false);
    });

    it('should not throw if directory does not exist', async () => {
      await expect(storage.deleteSession('sess_not_exists')).resolves.not.toThrow();
    });
  });
});
