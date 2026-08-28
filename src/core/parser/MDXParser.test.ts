import { describe, expect, it } from 'vitest';

import {
  buildCodeMask,
  extractHeadings,
  extractWikiLinks,
  parseFrontmatter,
  parseNote,
  resolveWikiLink,
  serializeDocument,
} from './MDXParser';
import type { Workspace } from '../workspace/types';

describe('parseFrontmatter', () => {
  it('sépare le YAML du corps', () => {
    const { frontmatter, content } = parseFrontmatter(
      '---\ntitle: Ma page\ntags: [a, b]\n---\n\n# Titre\n',
    );
    expect(frontmatter).toEqual({ title: 'Ma page', tags: ['a', 'b'] });
    expect(content).toBe('\n# Titre\n');
  });

  it('renvoie un document intact quand il n’y a pas de frontmatter', () => {
    const raw = '# Titre\n\nDu texte.';
    expect(parseFrontmatter(raw)).toEqual({ frontmatter: {}, content: raw });
  });

  it('conserve le contenu quand le YAML est invalide, et signale l’erreur', () => {
    const raw = '---\ntitle: [non fermé\n---\n\nCorps\n';
    const result = parseFrontmatter(raw);
    expect(result.error).toBeTruthy();
    // Le bloc reste dans le corps : on ne perd rien de ce qu'a écrit l'auteur.
    expect(result.content).toBe(raw);
  });

  it('fait un aller-retour sans perte', () => {
    const frontmatter = { title: 'Test', tags: ['x'] };
    const content = '# Test\n\nCorps.\n';
    const round = parseFrontmatter(serializeDocument(frontmatter, content));
    expect(round.frontmatter).toEqual(frontmatter);
    expect(round.content.trim()).toBe(content.trim());
  });
});

describe('buildCodeMask', () => {
  it('masque les blocs délimités et les spans inline', () => {
    const source = 'texte `code` fin\n```\nbloc\n```\nfin';
    const mask = buildCodeMask(source);

    expect(mask[0]).toBe(false); // « t » de texte
    expect(mask[source.indexOf('`code`')]).toBe(true);
    expect(mask[source.indexOf('bloc')]).toBe(true);
    expect(mask[source.lastIndexOf('fin')]).toBe(false);
  });
});

describe('extractWikiLinks', () => {
  it('reconnaît les formes simples, avec libellé et cross-workspace', () => {
    const links = extractWikiLinks(
      'Voir [[page]], [[autre|Autre page]] et [[Wiki:process:onboarding]].',
    );

    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({ target: 'page' });
    expect(links[1]).toMatchObject({ target: 'autre', label: 'Autre page' });
    expect(links[2]).toMatchObject({
      workspaceHint: 'Wiki',
      target: 'process/onboarding',
    });
  });

  it('ignore les liens cités dans du code', () => {
    const source = 'Syntaxe : `[[exemple]]`\n\n```md\n[[autre-exemple]]\n```\n\nVrai : [[page]]';
    const links = extractWikiLinks(source);

    expect(links.map((link) => link.target)).toEqual(['page']);
  });

  it('retire l’extension de la cible', () => {
    expect(extractWikiLinks('[[dossier/page.mdx]]')[0]?.target).toBe('dossier/page');
  });
});

describe('extractHeadings', () => {
  it('relève les titres hors code et calcule les ancres', () => {
    const headings = extractHeadings('# Déploiement\n\n```\n# pas un titre\n```\n\n## Étape 2');

    expect(headings).toEqual([
      { level: 1, text: 'Déploiement', slug: 'deploiement' },
      { level: 2, text: 'Étape 2', slug: 'etape-2' },
    ]);
  });
});

describe('parseNote', () => {
  it('prend le titre du frontmatter en priorité', () => {
    const note = parseNote('ws', 'a/b.mdx', '---\ntitle: Depuis YAML\n---\n\n# Depuis H1\n');
    expect(note.title).toBe('Depuis YAML');
    expect(note.slug).toBe('a/b');
    expect(note.id).toBe('ws::a/b');
  });

  it('retombe sur le premier H1, puis sur le nom de fichier', () => {
    expect(parseNote('ws', 'a/b.mdx', '# Depuis H1\n').title).toBe('Depuis H1');
    expect(parseNote('ws', 'a/mon-fichier.mdx', 'Sans titre.\n').title).toBe('mon-fichier');
  });
});

describe('resolveWikiLink', () => {
  const workspaces: Workspace[] = [
    { id: 'w1', name: 'Notes', type: 'local', location: '/notes', status: 'ready' },
    { id: 'w2', name: 'Wiki', type: 'local', location: '/wiki', status: 'ready' },
  ];

  const exists = (workspaceId: string, slug: string) =>
    (workspaceId === 'w1' && slug === 'locale') ||
    (workspaceId === 'w2' && slug === 'process/onboarding') ||
    (workspaceId === 'w1' && slug === 'faux/chemin');

  it('résout un lien local', () => {
    const [link] = extractWikiLinks('[[locale]]');
    const resolved = resolveWikiLink(link!, 'w1', workspaces, exists);
    expect(resolved.targetId).toBe('w1::locale');
  });

  it('résout un lien cross-workspace par le nom du workspace', () => {
    const [link] = extractWikiLinks('[[Wiki:process:onboarding]]');
    const resolved = resolveWikiLink(link!, 'w1', workspaces, exists);
    expect(resolved.targetWorkspaceId).toBe('w2');
    expect(resolved.targetId).toBe('w2::process/onboarding');
  });

  it('traite un préfixe inconnu comme un segment de chemin', () => {
    // « faux » n'est pas un workspace : le lien reste local et le `:` redevient
    // un séparateur de chemin.
    const [link] = extractWikiLinks('[[faux:chemin]]');
    const resolved = resolveWikiLink(link!, 'w1', workspaces, exists);
    expect(resolved.targetWorkspaceId).toBe('w1');
    expect(resolved.targetId).toBe('w1::faux/chemin');
  });

  it('signale une cible inexistante sans inventer de note', () => {
    const [link] = extractWikiLinks('[[nulle-part]]');
    expect(resolveWikiLink(link!, 'w1', workspaces, exists).targetId).toBeNull();
  });
});
