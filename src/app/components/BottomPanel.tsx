import { useMemo, useState } from 'react';

import { backlinks, orphanNodes, outgoingLinks } from '../../core/graph/KnowledgeGraph';
import type { GraphNode } from '../../core/graph/types';
import { noteId } from '../../core/workspace/types';
import { useOpenNote } from '../hooks/useWorkspace';
import { useDocStore } from '../store/DocStore';

type Tab = 'backlinks' | 'orphans' | 'recents';

/**
 * Panneau bas : ce qui pointe vers la note courante, ce qu'elle référence, et
 * les notes que rien ne relie.
 *
 * Les orphelines sont la contrepartie utile du graphe : dans un wiki qui grossit,
 * ce sont elles qui se perdent.
 */
export function BottomPanel() {
  const [tab, setTab] = useState<Tab>('backlinks');
  const [collapsed, setCollapsed] = useState(false);

  const graph = useDocStore((state) => state.graph);
  const recents = useDocStore((state) => state.recents);
  const openNote = useDocStore((state) => state.openNote);
  const notesByWorkspace = useDocStore((state) => state.notesByWorkspace);
  const workspaces = useDocStore((state) => state.workspaces);
  const note = useOpenNote();

  const incoming = useMemo(
    () => (note ? backlinks(graph, noteId(note.workspaceId, note.slug)) : []),
    [graph, note],
  );
  const outgoing = useMemo(
    () => (note ? outgoingLinks(graph, noteId(note.workspaceId, note.slug)) : []),
    [graph, note],
  );
  const orphans = useMemo(() => orphanNodes(graph), [graph]);

  const openNode = (node: GraphNode) => {
    const target = notesByWorkspace[node.workspaceId]?.find(
      (candidate) => candidate.slug === node.slug,
    );
    if (target) void openNote(target.workspaceId, target.path);
  };

  const workspaceName = (id: string) =>
    workspaces.find((workspace) => workspace.id === id)?.name ?? '';

  return (
    <section className={collapsed ? 'bottom-panel is-collapsed' : 'bottom-panel'}>
      <header className="bottom-panel__header">
        <div className="bottom-panel__tabs">
          <button
            type="button"
            className={tab === 'backlinks' ? 'is-active' : ''}
            onClick={() => setTab('backlinks')}
          >
            Liens ({incoming.length}/{outgoing.length})
          </button>
          <button
            type="button"
            className={tab === 'orphans' ? 'is-active' : ''}
            onClick={() => setTab('orphans')}
          >
            Orphelines ({orphans.length})
          </button>
          <button
            type="button"
            className={tab === 'recents' ? 'is-active' : ''}
            onClick={() => setTab('recents')}
          >
            Récents
          </button>
        </div>
        <button
          type="button"
          className="bottom-panel__collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Déplier le panneau' : 'Replier le panneau'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </header>

      {!collapsed && (
        <div className="bottom-panel__body">
          {tab === 'backlinks' && (
            <div className="link-columns">
              <NodeList
                title="Pointent vers cette note"
                nodes={incoming}
                onOpen={openNode}
                workspaceName={workspaceName}
              />
              <NodeList
                title="Référencées par cette note"
                nodes={outgoing}
                onOpen={openNode}
                workspaceName={workspaceName}
              />
            </div>
          )}

          {tab === 'orphans' && (
            <NodeList
              title="Notes sans aucun lien"
              nodes={orphans}
              onOpen={openNode}
              workspaceName={workspaceName}
            />
          )}

          {tab === 'recents' && (
            <ul className="node-list__items">
              {recents.length === 0 && <li className="node-list__empty">Rien encore.</li>}
              {recents.map((entry) => (
                <li key={`${entry.workspaceId}::${entry.path}`}>
                  <button
                    type="button"
                    onClick={() => void openNote(entry.workspaceId, entry.path)}
                  >
                    {entry.path}
                    <span className="node-list__origin">{workspaceName(entry.workspaceId)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function NodeList({
  title,
  nodes,
  onOpen,
  workspaceName,
}: {
  title: string;
  nodes: GraphNode[];
  onOpen: (node: GraphNode) => void;
  workspaceName: (id: string) => string;
}) {
  return (
    <div className="node-list">
      <h3>{title}</h3>
      <ul className="node-list__items">
        {nodes.length === 0 && <li className="node-list__empty">Aucune.</li>}
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className={node.missing ? 'is-missing' : ''}
              disabled={node.missing}
              onClick={() => onOpen(node)}
            >
              {node.label}
              <span className="node-list__origin">
                {node.missing ? 'lien cassé' : workspaceName(node.workspaceId)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
