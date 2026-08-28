import { resolveWikiLink } from '../parser/MDXParser';
import type { Note, ResolvedLink, Workspace } from '../workspace/types';
import { noteId } from '../workspace/types';
import type { Graph, GraphEdge, GraphNode } from './types';

/**
 * Construit le graphe de connaissances à partir des notes indexées.
 *
 * Les liens cassés ne sont pas jetés : ils produisent un nœud `missing`. Dans
 * un wiki, savoir *où* pointent les liens morts vaut au moins autant que la
 * carte des pages existantes — c'est la liste de ce qui reste à écrire.
 */
export function buildGraph(notes: Note[], workspaces: Workspace[]): Graph {
  const existing = new Set(notes.map((note) => note.id));
  const slugExists = (workspaceId: string, slug: string): boolean =>
    existing.has(noteId(workspaceId, slug));

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const note of notes) {
    nodes.set(note.id, {
      id: note.id,
      label: note.title,
      workspaceId: note.workspaceId,
      slug: note.slug,
      path: note.path,
      missing: false,
      degree: 0,
    });
  }

  for (const note of notes) {
    for (const link of note.links) {
      const resolved = resolveWikiLink(link, note.workspaceId, workspaces, slugExists);
      const targetId = resolved.targetId ?? missingNodeId(resolved);

      if (!nodes.has(targetId)) {
        nodes.set(targetId, {
          id: targetId,
          label: link.label ?? resolved.targetSlug,
          workspaceId: resolved.targetWorkspaceId ?? note.workspaceId,
          slug: resolved.targetSlug,
          missing: true,
          degree: 0,
        });
      }

      if (targetId === note.id) continue; // auto-référence : sans intérêt visuel

      const key = `${note.id}->${targetId}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);

      edges.push({
        source: note.id,
        target: targetId,
        crossWorkspace: nodes.get(targetId)!.workspaceId !== note.workspaceId,
      });
    }
  }

  for (const edge of edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (source) source.degree += 1;
    if (target) target.degree += 1;
  }

  return { nodes: [...nodes.values()], edges };
}

function missingNodeId(resolved: ResolvedLink): string {
  return noteId(resolved.targetWorkspaceId ?? 'inconnu', resolved.targetSlug);
}

/**
 * Restreint le graphe à un workspace.
 *
 * `includeCrossWorkspace` conserve les nœuds d'autres workspaces directement
 * reliés : sans eux, un workspace qui pointe massivement vers le wiki
 * paraîtrait isolé.
 */
export function filterGraphByWorkspace(
  graph: Graph,
  workspaceId: string,
  includeCrossWorkspace = true,
): Graph {
  const kept = new Set(
    graph.nodes.filter((node) => node.workspaceId === workspaceId).map((node) => node.id),
  );

  const edges = graph.edges.filter((edge) => {
    const sourceIn = kept.has(edge.source);
    const targetIn = kept.has(edge.target);
    return includeCrossWorkspace ? sourceIn || targetIn : sourceIn && targetIn;
  });

  if (includeCrossWorkspace) {
    for (const edge of edges) {
      kept.add(edge.source);
      kept.add(edge.target);
    }
  }

  return {
    nodes: graph.nodes.filter((node) => kept.has(node.id)),
    edges,
  };
}

/** Notes qui pointent vers `id`. */
export function backlinks(graph: Graph, id: string): GraphNode[] {
  const sources = new Set(
    graph.edges.filter((edge) => edge.target === id).map((edge) => edge.source),
  );
  return graph.nodes.filter((node) => sources.has(node.id));
}

/** Notes vers lesquelles `id` pointe. */
export function outgoingLinks(graph: Graph, id: string): GraphNode[] {
  const targets = new Set(
    graph.edges.filter((edge) => edge.source === id).map((edge) => edge.target),
  );
  return graph.nodes.filter((node) => targets.has(node.id));
}

/** Nœuds sans aucun lien, entrant ou sortant : les notes orphelines. */
export function orphanNodes(graph: Graph): GraphNode[] {
  return graph.nodes.filter((node) => !node.missing && node.degree === 0);
}
