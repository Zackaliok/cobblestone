import { describe, expect, it } from 'vitest';

import { parseNote } from '../parser/MDXParser';
import type { Note, Workspace } from '../workspace/types';
import {
  backlinks,
  buildGraph,
  filterGraphByWorkspace,
  orphanNodes,
  outgoingLinks,
} from './KnowledgeGraph';

const workspaces: Workspace[] = [
  { id: 'w1', name: 'Notes', type: 'local', location: '/notes', status: 'ready' },
  { id: 'w2', name: 'Wiki', type: 'local', location: '/wiki', status: 'ready' },
];

const notes: Note[] = [
  parseNote('w1', 'index.mdx', '# Index\n\n[[a]] et [[Wiki:page]] et [[fantome]]\n'),
  parseNote('w1', 'a.mdx', '# A\n\nRetour vers [[index]]\n'),
  parseNote('w1', 'orpheline.mdx', '# Orpheline\n\nRien.\n'),
  parseNote('w2', 'page.mdx', '# Page wiki\n'),
];

describe('buildGraph', () => {
  it('crée un nœud par note et une arête par lien résolu', () => {
    const graph = buildGraph(notes, workspaces);

    expect(graph.nodes.filter((node) => !node.missing)).toHaveLength(4);
    expect(graph.edges).toContainEqual({
      source: 'w1::index',
      target: 'w1::a',
      crossWorkspace: false,
    });
  });

  it('marque les arêtes cross-workspace', () => {
    const graph = buildGraph(notes, workspaces);
    const edge = graph.edges.find((candidate) => candidate.target === 'w2::page');
    expect(edge?.crossWorkspace).toBe(true);
  });

  it('matérialise les liens cassés au lieu de les jeter', () => {
    const graph = buildGraph(notes, workspaces);
    const missing = graph.nodes.filter((node) => node.missing);

    expect(missing).toHaveLength(1);
    expect(missing[0]?.slug).toBe('fantome');
  });

  it('ne compte qu’une arête pour un lien répété', () => {
    const repeated = [parseNote('w1', 'x.mdx', '[[y]] puis encore [[y]]'), parseNote('w1', 'y.mdx', '# Y')];
    expect(buildGraph(repeated, workspaces).edges).toHaveLength(1);
  });

  it('ignore les auto-références', () => {
    const selfLink = [parseNote('w1', 'x.mdx', '# X\n\nvoir [[x]]')];
    expect(buildGraph(selfLink, workspaces).edges).toHaveLength(0);
  });
});

describe('parcours du graphe', () => {
  const graph = buildGraph(notes, workspaces);

  it('remonte les rétroliens', () => {
    expect(backlinks(graph, 'w1::index').map((node) => node.id)).toEqual(['w1::a']);
  });

  it('remonte les liens sortants', () => {
    expect(outgoingLinks(graph, 'w1::a').map((node) => node.id)).toEqual(['w1::index']);
  });

  it('identifie les notes orphelines', () => {
    expect(orphanNodes(graph).map((node) => node.slug)).toEqual(['orpheline']);
  });
});

describe('filterGraphByWorkspace', () => {
  const graph = buildGraph(notes, workspaces);

  it('conserve les voisins d’un autre workspace par défaut', () => {
    const filtered = filterGraphByWorkspace(graph, 'w1');
    expect(filtered.nodes.map((node) => node.id)).toContain('w2::page');
  });

  it('les exclut quand on demande un graphe strictement local', () => {
    const filtered = filterGraphByWorkspace(graph, 'w1', false);
    expect(filtered.nodes.map((node) => node.id)).not.toContain('w2::page');
  });
});
