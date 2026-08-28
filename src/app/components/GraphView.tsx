import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { useMemo, useState } from 'react';

import { filterGraphByWorkspace } from '../../core/graph/KnowledgeGraph';
import type { Graph, GraphNode } from '../../core/graph/types';
import { useDocStore } from '../store/DocStore';

interface LayoutNode extends SimulationNodeDatum, GraphNode {}
type LayoutLink = SimulationLinkDatum<LayoutNode> & { crossWorkspace: boolean };

const WIDTH = 900;
const HEIGHT = 620;

/**
 * Nombre d'itérations de la simulation, exécutées d'un coup.
 *
 * d3-force anime normalement la disposition via `requestAnimationFrame`. On
 * s'en passe : rAF ne tourne pas quand la fenêtre est masquée (le graphe
 * resterait vide), et animer imposait de re-rendre toute la liste de nœuds
 * soixante fois par seconde. Une passe synchrone donne une disposition
 * déterministe, affichée immédiatement.
 */
const LAYOUT_ITERATIONS = 320;

/**
 * Graphe de connaissances, rendu en SVG et disposé par `d3-force`.
 *
 * Le rendu passe par React plutôt que par une manipulation directe du DOM par
 * d3 : la simulation écrit les positions dans un état local à chaque tick, ce
 * qui garde une seule autorité sur le DOM et évite les conflits classiques
 * entre d3 et React.
 */
export function GraphView() {
  const graph = useDocStore((state) => state.graph);
  const scope = useDocStore((state) => state.graphScope);
  const setScope = useDocStore((state) => state.setGraphScope);
  const activeWorkspaceId = useDocStore((state) => state.activeWorkspaceId);
  const workspaces = useDocStore((state) => state.workspaces);
  const openNote = useDocStore((state) => state.openNote);
  const notesByWorkspace = useDocStore((state) => state.notesByWorkspace);

  const visible = useMemo(() => {
    if (scope === 'global' || !activeWorkspaceId) return graph;
    return filterGraphByWorkspace(graph, activeWorkspaceId);
  }, [graph, scope, activeWorkspaceId]);

  const [hovered, setHovered] = useState<string | null>(null);

  const { nodes, links } = useMemo(() => computeLayout(visible), [visible]);

  if (visible.nodes.length === 0) {
    return (
      <div className="empty-state">
        <h2>Graphe vide</h2>
        <p>Créez des notes et reliez-les avec des liens [[wiki]] pour voir apparaître le graphe.</p>
      </div>
    );
  }

  const openNode = (node: GraphNode) => {
    if (node.missing) return;
    const note = notesByWorkspace[node.workspaceId]?.find(
      (candidate) => candidate.slug === node.slug,
    );
    if (note) void openNote(note.workspaceId, note.path);
  };

  const workspaceName = (id: string) =>
    workspaces.find((workspace) => workspace.id === id)?.name ?? 'inconnu';

  return (
    <div className="graph">
      <div className="graph__toolbar">
        <div className="segmented">
          <button
            type="button"
            className={scope === 'workspace' ? 'is-active' : ''}
            onClick={() => setScope('workspace')}
          >
            Workspace actif
          </button>
          <button
            type="button"
            className={scope === 'global' ? 'is-active' : ''}
            onClick={() => setScope('global')}
          >
            Global
          </button>
        </div>
        <p className="graph__legend">
          <span className="legend-dot legend-dot--note" /> note
          <span className="legend-dot legend-dot--missing" /> lien cassé
          <span className="legend-line legend-line--cross" /> cross-workspace
        </p>
      </div>

      <svg
        className="graph__canvas"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Graphe des liens entre notes"
      >
        <g>
          {links.map((link, index) => {
            const source = link.source as LayoutNode;
            const target = link.target as LayoutNode;
            const active =
              hovered !== null && (source.id === hovered || target.id === hovered);
            return (
              <line
                key={index}
                x1={source.x ?? 0}
                y1={source.y ?? 0}
                x2={target.x ?? 0}
                y2={target.y ?? 0}
                className={`graph__edge${link.crossWorkspace ? ' graph__edge--cross' : ''}${
                  active ? ' is-active' : ''
                }`}
              />
            );
          })}
        </g>

        <g>
          {nodes.map((node) => (
            <g
              key={node.id}
              transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
              className={`graph__node${node.missing ? ' graph__node--missing' : ''}`}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => openNode(node)}
            >
              <circle r={radius(node)} />
              <text y={radius(node) + 14} textAnchor="middle">
                {node.label}
              </text>
              <title>
                {node.missing
                  ? `${node.slug} — lien cassé`
                  : `${node.label} (${workspaceName(node.workspaceId)}) — ${node.degree} lien(s)`}
              </title>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

/** Un nœud très relié doit rester lisible sans écraser les autres : racine carrée. */
function radius(node: GraphNode): number {
  return 6 + Math.sqrt(node.degree) * 3;
}

/** Dispose le graphe en une passe synchrone, sans animation ni `rAF`. */
function computeLayout(graph: Graph): { nodes: LayoutNode[]; links: LayoutLink[] } {
  const nodes: LayoutNode[] = graph.nodes.map((node) => ({ ...node }));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const links: LayoutLink[] = graph.edges
    .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
    .map((edge) => ({
      source: byId.get(edge.source)!,
      target: byId.get(edge.target)!,
      crossWorkspace: edge.crossWorkspace,
    }));

  const simulation = forceSimulation<LayoutNode>(nodes)
    .force(
      'link',
      forceLink<LayoutNode, LayoutLink>(links)
        .id((node) => node.id)
        .distance(90)
        .strength(0.6),
    )
    .force('charge', forceManyBody().strength(-260))
    .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
    .force('collide', forceCollide<LayoutNode>().radius((node) => radius(node) + 12))
    .stop();

  simulation.tick(LAYOUT_ITERATIONS);

  return { nodes, links };
}
