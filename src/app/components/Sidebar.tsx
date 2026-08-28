import { useState } from 'react';

import { dirname } from '../../core/filesystem/FileSystem';
import type { FileEntry } from '../../core/workspace/types';
import { useSearch } from '../hooks/useSearch';
import { useActiveTree, useActiveWorkspace } from '../hooks/useWorkspace';
import { useDocStore } from '../store/DocStore';

export function Sidebar() {
  const workspace = useActiveWorkspace();
  const tree = useActiveTree();
  const { query, hits } = useSearch();
  const issues = useDocStore((state) => (workspace ? state.issues[workspace.id] : undefined));

  const searching = query.trim().length >= 2;

  if (!workspace) {
    return (
      <aside className="sidebar">
        <div className="sidebar__empty">
          <p>Aucun workspace ouvert.</p>
          <p>Utilisez « + Nouveau workspace » pour choisir un dossier.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      {workspace.status === 'unavailable' && (
        <p className="sidebar__alert">
          Dossier inaccessible. {workspace.error} Le workspace est conservé : rebranchez le
          disque ou rouvrez le dossier.
        </p>
      )}

      <NewNoteRow workspaceId={workspace.id} />

      {issues?.truncated && (
        <p className="sidebar__alert sidebar__alert--soft">
          Index tronqué : ce workspace contient plus de fichiers que la limite d'indexation.
        </p>
      )}

      <div className="sidebar__scroll">
        {searching ? (
          <SearchResults hits={hits} />
        ) : (
          <FileTree entries={tree} workspaceId={workspace.id} />
        )}
      </div>
    </aside>
  );
}

function SearchResults({ hits }: { hits: ReturnType<typeof useSearch>['hits'] }) {
  const openNote = useDocStore((state) => state.openNote);
  const workspaces = useDocStore((state) => state.workspaces);

  if (hits.length === 0) {
    return <p className="sidebar__empty">Aucun résultat.</p>;
  }

  return (
    <ul className="results">
      {hits.map((hit) => (
        <li key={hit.note.id}>
          <button
            type="button"
            className="results__item"
            onClick={() => void openNote(hit.note.workspaceId, hit.note.path)}
          >
            <span className="results__title">{hit.note.title}</span>
            <span className="results__path">
              {workspaces.find((w) => w.id === hit.note.workspaceId)?.name} · {hit.note.path}
            </span>
            <span className="results__excerpt">
              {highlight(hit.excerpt, hit.highlights)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Découpe l'extrait pour mettre les termes trouvés en évidence. */
function highlight(text: string, ranges: Array<{ start: number; end: number }>) {
  if (ranges.length === 0) return text;

  const parts: Array<string | { match: string }> = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push({ match: text.slice(range.start, range.end) });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return parts.map((part, index) =>
    typeof part === 'string' ? (
      <span key={index}>{part}</span>
    ) : (
      <mark key={index}>{part.match}</mark>
    ),
  );
}

function FileTree({ entries, workspaceId }: { entries: FileEntry[]; workspaceId: string }) {
  if (entries.length === 0) {
    return <p className="sidebar__empty">Aucun fichier .mdx ou .md dans ce dossier.</p>;
  }
  return (
    <ul className="tree">
      {entries.map((entry) => (
        <TreeNode key={entry.path} entry={entry} workspaceId={workspaceId} depth={0} />
      ))}
    </ul>
  );
}

function TreeNode({
  entry,
  workspaceId,
  depth,
}: {
  entry: FileEntry;
  workspaceId: string;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const open = useDocStore((state) => state.open);
  const openNote = useDocStore((state) => state.openNote);

  if (entry.isDirectory) {
    return (
      <li className="tree__folder">
        <button
          type="button"
          className="tree__row"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <span className={expanded ? 'chevron is-open' : 'chevron'} aria-hidden="true">
            ▶
          </span>
          {entry.name}
        </button>
        {expanded && entry.children && (
          <ul>
            {entry.children.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                workspaceId={workspaceId}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isOpen = open?.workspaceId === workspaceId && open.path === entry.path;

  return (
    <li className="tree__file">
      <div className={isOpen ? 'tree__row is-open' : 'tree__row'}>
        <button
          type="button"
          className="tree__name"
          style={{ paddingLeft: `${depth * 12 + 20}px` }}
          onClick={() => void openNote(workspaceId, entry.path)}
        >
          {entry.name}
        </button>
        <FileActions workspaceId={workspaceId} path={entry.path} name={entry.name} />
      </div>
    </li>
  );
}

/**
 * Renommage et suppression.
 *
 * La suppression demande une confirmation en deux temps, dans l'interface
 * plutôt que via une boîte système : c'est une action irréversible sur un
 * fichier réel de l'utilisateur.
 */
function FileActions({
  workspaceId,
  path,
  name,
}: {
  workspaceId: string;
  path: string;
  name: string;
}) {
  const renameNote = useDocStore((state) => state.renameNote);
  const deleteNote = useDocStore((state) => state.deleteNote);

  const [mode, setMode] = useState<'idle' | 'rename' | 'confirm-delete'>('idle');
  const [value, setValue] = useState(name);

  if (mode === 'rename') {
    const submit = () => {
      const folder = dirname(path);
      const target = folder ? `${folder}/${value.trim()}` : value.trim();
      if (value.trim() && target !== path) void renameNote(workspaceId, path, target);
      setMode('idle');
    };

    return (
      <input
        className="tree__rename"
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={submit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
          if (event.key === 'Escape') {
            setValue(name);
            setMode('idle');
          }
        }}
      />
    );
  }

  if (mode === 'confirm-delete') {
    return (
      <span className="tree__confirm">
        <button
          type="button"
          className="tree__action tree__action--danger"
          onClick={() => {
            void deleteNote(workspaceId, path);
            setMode('idle');
          }}
        >
          Supprimer
        </button>
        <button type="button" className="tree__action" onClick={() => setMode('idle')}>
          Annuler
        </button>
      </span>
    );
  }

  return (
    <span className="tree__actions">
      <button
        type="button"
        className="tree__action"
        title="Renommer"
        onClick={() => setMode('rename')}
      >
        ✎
      </button>
      <button
        type="button"
        className="tree__action"
        title="Supprimer"
        onClick={() => setMode('confirm-delete')}
      >
        🗑
      </button>
    </span>
  );
}

function NewNoteRow({ workspaceId }: { workspaceId: string }) {
  const createNote = useDocStore((state) => state.createNote);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  if (!editing) {
    return (
      <button type="button" className="sidebar__new" onClick={() => setEditing(true)}>
        + Nouvelle note
      </button>
    );
  }

  const submit = () => {
    const path = value.trim();
    if (path) void createNote(workspaceId, path);
    setValue('');
    setEditing(false);
  };

  return (
    <input
      className="sidebar__new-input"
      autoFocus
      value={value}
      placeholder="dossier/ma-note"
      onChange={(event) => setValue(event.target.value)}
      onBlur={submit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') submit();
        if (event.key === 'Escape') {
          setValue('');
          setEditing(false);
        }
      }}
    />
  );
}
