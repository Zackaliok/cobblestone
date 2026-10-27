import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryFileSystem } from '../../core/filesystem/MemoryFileSystem';
import { askToLeave, type LeaveChoice } from '../unsavedChanges';
import { useDocStore, workspaceManager } from './DocStore';

vi.mock('../unsavedChanges', () => ({ askToLeave: vi.fn() }));

const ask = vi.mocked(askToLeave);
let fileSystem: MemoryFileSystem;

function answer(choice: LeaveChoice) {
  ask.mockResolvedValue(choice);
}

beforeEach(async () => {
  ask.mockReset();
  fileSystem = new MemoryFileSystem('memory://brouillon', { 'a.md': '# A', 'b.md': '# B' });
  workspaceManager.attach('brouillon', fileSystem);
  useDocStore.setState({ open: null, draft: '', persisted: '', conflict: null, recents: [] });
  await useDocStore.getState().openNote('brouillon', 'a.md');
});

describe('brouillon non enregistré', () => {
  it('ouvre une autre note sans rien demander si le brouillon est intact', async () => {
    await useDocStore.getState().openNote('brouillon', 'b.md');

    expect(ask).not.toHaveBeenCalled();
    expect(useDocStore.getState().open?.path).toBe('b.md');
  });

  it('garde le brouillon si l’utilisateur annule', async () => {
    useDocStore.getState().setDraft('# A modifié');
    answer('cancel');

    await useDocStore.getState().openNote('brouillon', 'b.md');

    expect(ask).toHaveBeenCalledWith('a.md');
    expect(useDocStore.getState().open?.path).toBe('a.md');
    expect(useDocStore.getState().draft).toBe('# A modifié');
  });

  it('enregistre avant de changer de note', async () => {
    useDocStore.getState().setDraft('# A modifié');
    answer('save');

    await useDocStore.getState().openNote('brouillon', 'b.md');

    expect(await fileSystem.read('a.md')).toBe('# A modifié');
    expect(useDocStore.getState().open?.path).toBe('b.md');
  });

  it('abandonne le brouillon sur demande', async () => {
    useDocStore.getState().setDraft('# A modifié');
    answer('discard');

    await useDocStore.getState().openNote('brouillon', 'b.md');

    expect(await fileSystem.read('a.md')).toBe('# A');
    expect(useDocStore.getState().draft).toBe('# B');
  });

  it('reste sur la note si l’enregistrement bute sur un conflit', async () => {
    useDocStore.getState().setDraft('# A modifié');
    await fileSystem.write('a.md', '# A modifié ailleurs');
    answer('save');

    await useDocStore.getState().openNote('brouillon', 'b.md');

    expect(useDocStore.getState().open?.path).toBe('a.md');
    expect(useDocStore.getState().conflict).not.toBeNull();
    expect(useDocStore.getState().draft).toBe('# A modifié');
  });

  it('ne relit pas le disque quand on rouvre la note en cours', async () => {
    useDocStore.getState().setDraft('# A modifié');

    await useDocStore.getState().openNote('brouillon', 'a.md');

    expect(ask).not.toHaveBeenCalled();
    expect(useDocStore.getState().draft).toBe('# A modifié');
  });

  it('ne crée pas la note si l’utilisateur annule', async () => {
    useDocStore.getState().setDraft('# A modifié');
    answer('cancel');

    await useDocStore.getState().createNote('brouillon', 'c.md');

    expect(await fileSystem.exists('c.md')).toBe(false);
    expect(useDocStore.getState().draft).toBe('# A modifié');
  });

  it('garde le brouillon quand on renomme la note ouverte', async () => {
    useDocStore.getState().setDraft('# A modifié');

    await useDocStore.getState().renameNote('brouillon', 'a.md', 'z.md');

    expect(ask).not.toHaveBeenCalled();
    expect(useDocStore.getState().open?.path).toBe('z.md');
    expect(useDocStore.getState().draft).toBe('# A modifié');
  });
});
