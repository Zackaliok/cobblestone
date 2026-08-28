import { useMemo } from 'react';

import type { FileEntry, Note, Workspace } from '../../core/workspace/types';
import { useDocStore } from '../store/DocStore';

export function useActiveWorkspace(): Workspace | null {
  const workspaces = useDocStore((state) => state.workspaces);
  const activeId = useDocStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeId) ?? null;
}

export function useActiveTree(): FileEntry[] {
  const activeId = useDocStore((state) => state.activeWorkspaceId);
  const trees = useDocStore((state) => state.trees);
  return activeId ? (trees[activeId] ?? []) : [];
}

/** Notes de tous les workspaces, à plat — base du graphe global et de la recherche. */
export function useAllNotes(): Note[] {
  const notesByWorkspace = useDocStore((state) => state.notesByWorkspace);
  return useMemo(() => Object.values(notesByWorkspace).flat(), [notesByWorkspace]);
}

export function useWorkspaceNotes(workspaceId: string | null): Note[] {
  const notesByWorkspace = useDocStore((state) => state.notesByWorkspace);
  return workspaceId ? (notesByWorkspace[workspaceId] ?? []) : [];
}

/** Note actuellement ouverte, telle qu'indexée sur le disque. */
export function useOpenNote(): Note | null {
  const open = useDocStore((state) => state.open);
  const notesByWorkspace = useDocStore((state) => state.notesByWorkspace);

  if (!open) return null;
  return (
    notesByWorkspace[open.workspaceId]?.find((note) => note.path === open.path) ?? null
  );
}

/** `true` quand le brouillon diffère du contenu enregistré. */
export function useIsDirty(): boolean {
  const draft = useDocStore((state) => state.draft);
  const persisted = useDocStore((state) => state.persisted);
  const open = useDocStore((state) => state.open);
  return open !== null && draft !== persisted;
}
