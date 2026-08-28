import { useDeferredValue, useMemo } from 'react';

import { searchNotes, type SearchHit } from '../../core/search/searchNotes';
import { useDocStore } from '../store/DocStore';
import { useAllNotes, useWorkspaceNotes } from './useWorkspace';

/**
 * Recherche full-text sur l'index en mémoire.
 *
 * `useDeferredValue` garde la saisie fluide : sur un gros workspace, le calcul
 * des résultats peut prendre quelques dizaines de millisecondes et ne doit pas
 * bloquer les frappes.
 */
export function useSearch(): { query: string; hits: SearchHit[] } {
  const query = useDocStore((state) => state.searchQuery);
  const scope = useDocStore((state) => state.searchScope);
  const activeWorkspaceId = useDocStore((state) => state.activeWorkspaceId);

  const allNotes = useAllNotes();
  const workspaceNotes = useWorkspaceNotes(activeWorkspaceId);
  const notes = scope === 'global' ? allNotes : workspaceNotes;

  const deferredQuery = useDeferredValue(query);

  const hits = useMemo(
    () => (deferredQuery.trim().length < 2 ? [] : searchNotes(notes, deferredQuery)),
    [notes, deferredQuery],
  );

  return { query, hits };
}
