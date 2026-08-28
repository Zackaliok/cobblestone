import { describe, expect, it } from 'vitest';

import { parseNote } from '../parser/MDXParser';
import { searchNotes } from './searchNotes';

const notes = [
  parseNote('w1', 'deploiement.mdx', '---\ntitle: Déploiement\n---\n\nProcédure de mise en production.\n'),
  parseNote('w1', 'notes.mdx', '# Notes\n\nOn parle de déploiement continu ici, puis encore de déploiement.\n'),
  parseNote('w1', 'autre.mdx', '# Autre\n\nRien à voir.\n'),
];

describe('searchNotes', () => {
  it('ignore les accents et la casse', () => {
    const hits = searchNotes(notes, 'DEPLOIEMENT');
    expect(hits).toHaveLength(2);
  });

  it('classe la note dont c’est le titre en premier', () => {
    const hits = searchNotes(notes, 'déploiement');
    expect(hits[0]?.note.slug).toBe('deploiement');
  });

  it('exige la présence de tous les termes', () => {
    expect(searchNotes(notes, 'déploiement continu')).toHaveLength(1);
    expect(searchNotes(notes, 'déploiement inexistant')).toHaveLength(0);
  });

  it('renvoie un extrait et les bornes à mettre en évidence', () => {
    const [hit] = searchNotes(notes, 'production');
    expect(hit?.excerpt).toContain('production');

    const range = hit!.highlights[0]!;
    expect(hit!.excerpt.slice(range.start, range.end).toLowerCase()).toBe('production');
  });

  it('ne renvoie rien pour une requête vide', () => {
    expect(searchNotes(notes, '   ')).toEqual([]);
  });
});
