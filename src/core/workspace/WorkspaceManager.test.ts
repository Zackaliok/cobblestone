import { describe, expect, it } from 'vitest';

import { MemoryFileSystem } from '../filesystem/MemoryFileSystem';
import { normalizeRelativePath, pathToSlug } from '../filesystem/FileSystem';
import { WorkspaceManager, uniqueWorkspaceName, workspaceNameFromPath } from './WorkspaceManager';
import type { Workspace } from './types';

function manager(files: Record<string, string>) {
  const instance = new WorkspaceManager();
  instance.attach('w1', new MemoryFileSystem('memory://w1', files));
  return instance;
}

describe('normalizeRelativePath', () => {
  it('normalise les séparateurs Windows', () => {
    expect(normalizeRelativePath('dossier\\page.mdx')).toBe('dossier/page.mdx');
  });

  it('refuse de sortir de la racine', () => {
    expect(() => normalizeRelativePath('../ailleurs.mdx')).toThrow();
    expect(() => normalizeRelativePath('a/../../ailleurs.mdx')).toThrow();
  });

  it('accepte un « .. » qui reste dans la racine', () => {
    expect(normalizeRelativePath('a/b/../c.mdx')).toBe('a/c.mdx');
  });
});

describe('pathToSlug', () => {
  it('retire l’extension en gardant le dossier', () => {
    expect(pathToSlug('process/onboarding.mdx')).toBe('process/onboarding');
    expect(pathToSlug('racine.md')).toBe('racine');
  });
});

describe('WorkspaceManager', () => {
  it('indexe les documents et construit l’arborescence', async () => {
    const instance = manager({
      'index.mdx': '# Index\n',
      'sous/dossier/page.mdx': '---\ntitle: Page\n---\n\nCorps\n',
      'ignore.txt': 'pas un document',
    });

    const result = await instance.scan('w1');

    expect(result.notes.map((note) => note.slug).sort()).toEqual([
      'index',
      'sous/dossier/page',
    ]);
    expect(result.truncated).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.tree.map((entry) => entry.name)).toEqual(['sous', 'index.mdx']);
  });

  it('crée une note avec frontmatter et titre', async () => {
    const instance = manager({});
    const note = await instance.createNote('w1', 'notes/nouvelle');

    expect(note.path).toBe('notes/nouvelle.mdx');
    expect(note.frontmatter['title']).toBe('nouvelle');
    expect(note.content).toContain('# nouvelle');
  });

  it('refuse d’écraser un fichier existant', async () => {
    const instance = manager({ 'existe.mdx': '# Existe\n' });
    await expect(instance.createNote('w1', 'existe.mdx')).rejects.toThrow(/existe déjà/);
  });

  it('refuse un renommage vers une cible occupée', async () => {
    const instance = manager({ 'a.mdx': '# A\n', 'b.mdx': '# B\n' });
    await expect(instance.renameNote('w1', 'a.mdx', 'b.mdx')).rejects.toThrow(/existe déjà/);
  });

  it('ajoute l’extension manquante au renommage', async () => {
    const instance = manager({ 'a.mdx': '# A\n' });
    expect(await instance.renameNote('w1', 'a.mdx', 'nouveau-nom')).toBe('nouveau-nom.mdx');
  });

  it('signale un workspace injoignable sans lever', async () => {
    const instance = new WorkspaceManager();
    expect(await instance.isAvailable('inconnu')).toBe(false);
  });
});

describe('uniqueWorkspaceName', () => {
  const existing: Workspace[] = [
    { id: '1', name: 'Docs', type: 'local', location: '/a', status: 'ready' },
    { id: '2', name: 'Docs 2', type: 'local', location: '/b', status: 'ready' },
  ];

  it('laisse un nom libre intact', () => {
    expect(uniqueWorkspaceName('Wiki', existing)).toBe('Wiki');
  });

  it('suffixe jusqu’au premier nom disponible', () => {
    // Le nom est le préfixe des liens cross-workspace : deux homonymes
    // rendraient `[[Docs:page]]` ambigu.
    expect(uniqueWorkspaceName('Docs', existing)).toBe('Docs 3');
  });
});

describe('workspaceNameFromPath', () => {
  it('prend le dernier segment, quel que soit le séparateur', () => {
    expect(workspaceNameFromPath('C:\\Users\\zacka\\Dev\\mon-projet')).toBe('mon-projet');
    expect(workspaceNameFromPath('/home/z/docs/')).toBe('docs');
  });
});
