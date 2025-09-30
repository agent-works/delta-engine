#!/usr/bin/env node

/**
 * Unit tests for workspace-manager.ts
 *
 * Tests specification-driven behavior from v1.2.1 release notes:
 * - W001-style workspace naming
 * - LAST_USED file tracking
 * - Workspace selection logic
 * - Legacy workspace_ format support
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import {
  listExistingWorkspaces,
  generateNextWorkspaceId,
  loadLastUsedWorkspace,
  saveLastUsedWorkspace,
  createWorkspace,
  WorkspaceInfo,
} from '../../src/workspace-manager.js';

describe('workspace-manager.ts', () => {
  let tempWorkspacesDir: string;

  beforeEach(async () => {
    tempWorkspacesDir = path.join(os.tmpdir(), `workspaces-test-${uuidv4()}`);
    await fs.mkdir(tempWorkspacesDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempWorkspacesDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('listExistingWorkspaces', () => {
    it('should return empty array when directory does not exist', async () => {
      const nonExistentDir = path.join(os.tmpdir(), `non-existent-${uuidv4()}`);
      const workspaces = await listExistingWorkspaces(nonExistentDir);
      expect(workspaces).toEqual([]);
    });

    it('should return empty array when directory is empty', async () => {
      const workspaces = await listExistingWorkspaces(tempWorkspacesDir);
      expect(workspaces).toEqual([]);
    });

    it('should list W-format workspaces', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));
      await fs.mkdir(path.join(tempWorkspacesDir, 'W002'));

      const workspaces = await listExistingWorkspaces(tempWorkspacesDir);

      expect(workspaces.length).toBe(2);
      expect(workspaces[0].name).toBe('W001');
      expect(workspaces[0].isLegacy).toBe(false);
      expect(workspaces[1].name).toBe('W002');
      expect(workspaces[1].isLegacy).toBe(false);
    });

    it('should identify legacy workspace_ format', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'workspace_project1'));
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));

      const workspaces = await listExistingWorkspaces(tempWorkspacesDir);

      expect(workspaces.length).toBe(2);

      // W-format comes first
      expect(workspaces[0].name).toBe('W001');
      expect(workspaces[0].isLegacy).toBe(false);

      // Legacy format comes after
      expect(workspaces[1].name).toBe('workspace_project1');
      expect(workspaces[1].isLegacy).toBe(true);
    });

    it('should sort W-format workspaces numerically', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W010'));
      await fs.mkdir(path.join(tempWorkspacesDir, 'W002'));
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));

      const workspaces = await listExistingWorkspaces(tempWorkspacesDir);

      expect(workspaces.map(w => w.name)).toEqual(['W001', 'W002', 'W010']);
    });

    it('should ignore hidden directories', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, '.hidden'));
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));

      const workspaces = await listExistingWorkspaces(tempWorkspacesDir);

      expect(workspaces.length).toBe(1);
      expect(workspaces[0].name).toBe('W001');
    });

    it('should ignore files (not directories)', async () => {
      await fs.writeFile(path.join(tempWorkspacesDir, 'LAST_USED'), 'W001', 'utf-8');
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));

      const workspaces = await listExistingWorkspaces(tempWorkspacesDir);

      expect(workspaces.length).toBe(1);
      expect(workspaces[0].name).toBe('W001');
    });

    it('should include path in WorkspaceInfo', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));

      const workspaces = await listExistingWorkspaces(tempWorkspacesDir);

      expect(workspaces[0].path).toBe(path.join(tempWorkspacesDir, 'W001'));
    });
  });

  describe('generateNextWorkspaceId', () => {
    it('should return W001 when no workspaces exist', async () => {
      const nextId = await generateNextWorkspaceId(tempWorkspacesDir);
      expect(nextId).toBe('W001');
    });

    it('should return W002 when W001 exists', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));

      const nextId = await generateNextWorkspaceId(tempWorkspacesDir);
      expect(nextId).toBe('W002');
    });

    it('should handle gaps in workspace numbers', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));
      await fs.mkdir(path.join(tempWorkspacesDir, 'W005'));

      const nextId = await generateNextWorkspaceId(tempWorkspacesDir);
      expect(nextId).toBe('W006');
    });

    it('should ignore legacy workspaces when generating ID', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'workspace_project1'));

      const nextId = await generateNextWorkspaceId(tempWorkspacesDir);
      expect(nextId).toBe('W001');
    });

    it('should pad numbers with zeros (W010, not W10)', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W009'));

      const nextId = await generateNextWorkspaceId(tempWorkspacesDir);
      expect(nextId).toBe('W010');
    });

    it('should handle large workspace numbers', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W099'));

      const nextId = await generateNextWorkspaceId(tempWorkspacesDir);
      expect(nextId).toBe('W100');
    });
  });

  describe('loadLastUsedWorkspace', () => {
    it('should return null when LAST_USED file does not exist', async () => {
      const lastUsed = await loadLastUsedWorkspace(tempWorkspacesDir);
      expect(lastUsed).toBeNull();
    });

    it('should return workspace name from LAST_USED file', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));
      await fs.writeFile(path.join(tempWorkspacesDir, 'LAST_USED'), 'W001', 'utf-8');

      const lastUsed = await loadLastUsedWorkspace(tempWorkspacesDir);
      expect(lastUsed).toBe('W001');
    });

    it('should trim whitespace from LAST_USED content', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W002'));
      await fs.writeFile(path.join(tempWorkspacesDir, 'LAST_USED'), '  W002  \n', 'utf-8');

      const lastUsed = await loadLastUsedWorkspace(tempWorkspacesDir);
      expect(lastUsed).toBe('W002');
    });

    it('should return null when referenced workspace no longer exists', async () => {
      await fs.writeFile(path.join(tempWorkspacesDir, 'LAST_USED'), 'W999', 'utf-8');

      const lastUsed = await loadLastUsedWorkspace(tempWorkspacesDir);
      expect(lastUsed).toBeNull();
    });

    it('should verify workspace is a directory (not a file)', async () => {
      await fs.writeFile(path.join(tempWorkspacesDir, 'not-a-dir'), 'data', 'utf-8');
      await fs.writeFile(path.join(tempWorkspacesDir, 'LAST_USED'), 'not-a-dir', 'utf-8');

      const lastUsed = await loadLastUsedWorkspace(tempWorkspacesDir);
      expect(lastUsed).toBeNull();
    });

    it('should handle legacy workspace names', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'workspace_project'));
      await fs.writeFile(path.join(tempWorkspacesDir, 'LAST_USED'), 'workspace_project', 'utf-8');

      const lastUsed = await loadLastUsedWorkspace(tempWorkspacesDir);
      expect(lastUsed).toBe('workspace_project');
    });
  });

  describe('saveLastUsedWorkspace', () => {
    it('should create LAST_USED file with workspace name', async () => {
      await saveLastUsedWorkspace(tempWorkspacesDir, 'W001');

      const content = await fs.readFile(path.join(tempWorkspacesDir, 'LAST_USED'), 'utf-8');
      expect(content).toBe('W001');
    });

    it('should overwrite existing LAST_USED file', async () => {
      await fs.writeFile(path.join(tempWorkspacesDir, 'LAST_USED'), 'W001', 'utf-8');

      await saveLastUsedWorkspace(tempWorkspacesDir, 'W002');

      const content = await fs.readFile(path.join(tempWorkspacesDir, 'LAST_USED'), 'utf-8');
      expect(content).toBe('W002');
    });

    it('should create workspaces directory if it does not exist', async () => {
      await fs.rm(tempWorkspacesDir, { recursive: true });

      await saveLastUsedWorkspace(tempWorkspacesDir, 'W001');

      const dirExists = await fs.access(tempWorkspacesDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);

      const fileExists = await fs.access(path.join(tempWorkspacesDir, 'LAST_USED'))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should not throw if write fails (warn instead)', async () => {
      // saveLastUsedWorkspace should not throw, just warn
      await expect(
        saveLastUsedWorkspace('/invalid/path/that/does/not/exist', 'W001')
      ).resolves.not.toThrow();
    });
  });

  describe('createWorkspace', () => {
    it('should create workspace directory', async () => {
      const workspacePath = await createWorkspace(tempWorkspacesDir, 'W001');

      expect(workspacePath).toBe(path.join(tempWorkspacesDir, 'W001'));

      const exists = await fs.access(workspacePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create parent directories if needed', async () => {
      await fs.rm(tempWorkspacesDir, { recursive: true });

      const workspacePath = await createWorkspace(tempWorkspacesDir, 'W001');

      const exists = await fs.access(workspacePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should handle custom workspace names', async () => {
      const workspacePath = await createWorkspace(tempWorkspacesDir, 'my-custom-workspace');

      expect(workspacePath).toBe(path.join(tempWorkspacesDir, 'my-custom-workspace'));

      const exists = await fs.access(workspacePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should not fail if workspace already exists', async () => {
      await fs.mkdir(path.join(tempWorkspacesDir, 'W001'));

      await expect(createWorkspace(tempWorkspacesDir, 'W001')).resolves.not.toThrow();
    });

    it('should return absolute path', async () => {
      const workspacePath = await createWorkspace(tempWorkspacesDir, 'W001');

      expect(path.isAbsolute(workspacePath)).toBe(true);
    });
  });

  describe('Integration - Workspace Lifecycle', () => {
    it('should support full workspace lifecycle: create → save → load', async () => {
      // Step 1: Generate first workspace ID
      const id1 = await generateNextWorkspaceId(tempWorkspacesDir);
      expect(id1).toBe('W001');

      // Step 2: Create workspace
      await createWorkspace(tempWorkspacesDir, id1);

      // Step 3: Save as last used
      await saveLastUsedWorkspace(tempWorkspacesDir, id1);

      // Step 4: Load last used
      const lastUsed = await loadLastUsedWorkspace(tempWorkspacesDir);
      expect(lastUsed).toBe('W001');

      // Step 5: Create second workspace
      const id2 = await generateNextWorkspaceId(tempWorkspacesDir);
      expect(id2).toBe('W002');

      await createWorkspace(tempWorkspacesDir, id2);
      await saveLastUsedWorkspace(tempWorkspacesDir, id2);

      // Step 6: Verify last used updated
      const lastUsed2 = await loadLastUsedWorkspace(tempWorkspacesDir);
      expect(lastUsed2).toBe('W002');

      // Step 7: List all workspaces
      const workspaces = await listExistingWorkspaces(tempWorkspacesDir);
      expect(workspaces.length).toBe(2);
      expect(workspaces.map(w => w.name)).toEqual(['W001', 'W002']);
    });

    it('should handle mixed W-format and legacy workspaces', async () => {
      // Create legacy workspace
      await fs.mkdir(path.join(tempWorkspacesDir, 'workspace_old_project'));

      // Generate next ID (should be W001, ignoring legacy)
      const nextId = await generateNextWorkspaceId(tempWorkspacesDir);
      expect(nextId).toBe('W001');

      // Create W001
      await createWorkspace(tempWorkspacesDir, 'W001');

      // List should show both, W-format first
      const workspaces = await listExistingWorkspaces(tempWorkspacesDir);
      expect(workspaces.length).toBe(2);
      expect(workspaces[0].name).toBe('W001');
      expect(workspaces[0].isLegacy).toBe(false);
      expect(workspaces[1].name).toBe('workspace_old_project');
      expect(workspaces[1].isLegacy).toBe(true);
    });
  });
});
