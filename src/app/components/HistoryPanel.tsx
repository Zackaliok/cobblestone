import { useEffect, useState } from 'react';

import type { Commit } from '../../core/git/LocalGitLog';
import { useDocStore } from '../store/DocStore';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; commits: Commit[] }
  | { kind: 'error'; message: string };

/**
 * Historique Git du fichier courant, en **lecture seule**.
 *
 * Cobblestone n'écrit jamais dans le dépôt d'un workspace local. Ce panneau
 * n'appelle que `git log` — le développeur reste seul maître de ses commits.
 * L'onglet n'est proposé que si le workspace se trouve dans un dépôt Git et si
 * le binaire `git` est disponible.
 */
export function HistoryPanel() {
  const open = useDocStore((state) => state.open);
  const workspaces = useDocStore((state) => state.workspaces);
  const [state, setState] = useState<State>({ kind: 'idle' });

  const workspace = workspaces.find((candidate) => candidate.id === open?.workspaceId);
  const gitRoot = workspace?.gitRoot;
  const absolutePath =
    workspace && open ? `${workspace.location.replace(/\\/g, '/')}/${open.path}` : null;

  useEffect(() => {
    if (!gitRoot || !absolutePath) {
      setState({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ kind: 'loading' });

    void (async () => {
      try {
        const { gitLog } = await import('../../core/git/LocalGitLog');
        const commits = await gitLog(gitRoot, absolutePath);
        if (!cancelled) setState({ kind: 'loaded', commits });
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gitRoot, absolutePath]);

  if (!open) {
    return (
      <div className="empty-state">
        <h2>Aucun document ouvert</h2>
      </div>
    );
  }

  if (!gitRoot) {
    return (
      <div className="empty-state">
        <h2>Pas de dépôt Git</h2>
        <p>
          Ce workspace n'est pas dans un dépôt Git, ou le binaire <code>git</code> est
          introuvable dans le PATH.
        </p>
      </div>
    );
  }

  return (
    <div className="history">
      <header className="history__header">
        <h2>Historique</h2>
        <p className="history__repo">Dépôt : {gitRoot}</p>
        <p className="history__note">
          Lecture seule — Cobblestone ne crée aucun commit sur un workspace local.
        </p>
      </header>

      {state.kind === 'loading' && <p className="history__status">Lecture de git log…</p>}

      {state.kind === 'error' && (
        <p className="history__status history__status--error">{state.message}</p>
      )}

      {state.kind === 'loaded' && state.commits.length === 0 && (
        <p className="history__status">
          Aucun commit pour ce fichier — il n'est sans doute pas encore suivi par Git.
        </p>
      )}

      {state.kind === 'loaded' && state.commits.length > 0 && (
        <ol className="history__list">
          {state.commits.map((commit) => (
            <li key={commit.hash} className="history__item">
              <div className="history__subject">{commit.subject}</div>
              <div className="history__meta">
                <span className="history__author">{commit.author}</span>
                <time dateTime={commit.date}>{formatDate(commit.date)}</time>
                <code className="history__hash">{commit.shortHash}</code>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
