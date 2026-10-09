import { describe, expect, it } from 'vitest';

import { MemoryFileSystem } from '../../core/filesystem/MemoryFileSystem';
import { useDocStore, workspaceManager } from './DocStore';

describe('refreshWorkspace', () => {
  it('fond les rafales de demandes en au plus deux scans', async () => {
    const fileSystem = new MemoryFileSystem('memory://rafale', { 'a.md': '# A' });
    let scans = 0;
    const list = fileSystem.list.bind(fileSystem);
    fileSystem.list = async () => {
      scans += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return list();
    };
    workspaceManager.attach('rafale', fileSystem);

    await Promise.all(Array.from({ length: 20 }, () => useDocStore.getState().refreshWorkspace('rafale')));

    // Un scan en cours + un seul passage de rattrapage pour toutes les demandes tardives.
    expect(scans).toBe(2);
    expect(useDocStore.getState().notesByWorkspace['rafale']).toHaveLength(1);

    // Après la rafale, un nouveau scan repart normalement.
    await useDocStore.getState().refreshWorkspace('rafale');
    expect(scans).toBe(3);
  });
});
