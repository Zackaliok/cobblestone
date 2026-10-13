import { describe, expect, it } from 'vitest';

import {
  blocksToMdx,
  htmlToMarkdown,
  markdownToHtml,
  mdxToBlocks,
} from './MDXEditorConverter';

/** Un aller-retour MDX -> blocs -> MDX, normalisé sur les lignes vides. */
const roundTrip = (source: string): string => blocksToMdx(mdxToBlocks(source)).trim();

describe('mdxToBlocks', () => {
  it('reconnaît titres, paragraphes, listes, citations et séparateurs', () => {
    const blocks = mdxToBlocks(
      '# Titre\n\nUn paragraphe.\n\n- un\n- deux\n\n> citation\n\n---\n',
    );

    expect(blocks.map((block) => block.type)).toEqual([
      'header',
      'paragraph',
      'list',
      'quote',
      'delimiter',
    ]);
  });

  it('garde les blocs de code en MDX brut, langage compris', () => {
    const blocks = mdxToBlocks('```ts\nconst a = 1;\n```\n');
    expect(blocks).toEqual([{ type: 'mdx', data: { code: '```ts\nconst a = 1;\n```' } }]);
  });

  it('garde le JSX intact', () => {
    const source = '<Accordion title="Détails">\n  Bonjour\n</Accordion>';
    expect(mdxToBlocks(source)).toEqual([{ type: 'mdx', data: { code: source } }]);
  });

  it.each(['info', 'warning', 'danger', 'success'])(
    'reconnaît un Callout %s comme bloc éditable',
    (type) => {
      expect(mdxToBlocks(`<Callout type="${type}">\n  Un **texte**\n</Callout>`)).toEqual([
        { type: 'callout', data: { type, text: 'Un <b>texte</b>' } },
      ]);
    },
  );

  it.each([
    ['type inconnu', '<Callout type="tip">\n  Bonjour\n</Callout>'],
    ['sans type', '<Callout>\n  Bonjour\n</Callout>'],
    ['attribut supplémentaire', '<Callout type="info" title="x">\n  Bonjour\n</Callout>'],
    ['sur une seule ligne', '<Callout type="info">Bonjour</Callout>'],
    ['ligne vide dans le corps', '<Callout type="info">\n  Un\n\n  Deux\n</Callout>'],
    ['liste dans le corps', '<Callout type="info">\n  - un\n  - deux\n</Callout>'],
    ['JSX imbriqué', '<Callout type="info">\n  <Badge />\n</Callout>'],
    ['indentation différente', '<Callout type="info">\n    Bonjour\n</Callout>'],
  ])('garde un Callout en MDX brut : %s', (_label, source) => {
    expect(mdxToBlocks(source)).toEqual([{ type: 'mdx', data: { code: source } }]);
  });

  it('garde les tableaux intacts', () => {
    const source = '| a | b |\n|---|---|\n| 1 | 2 |';
    expect(mdxToBlocks(source)).toEqual([{ type: 'mdx', data: { code: source } }]);
  });

  it('bascule une liste imbriquée en brut plutôt que de l’aplatir', () => {
    const source = '- un\n  - imbriqué\n- deux';
    const blocks = mdxToBlocks(source);
    expect(blocks[0]?.type).toBe('mdx');
  });

  it('numérote les listes ordonnées', () => {
    const blocks = mdxToBlocks('1. un\n2. deux\n');
    expect(blocks[0]).toEqual({
      type: 'list',
      data: { style: 'ordered', items: ['un', 'deux'] },
    });
  });
});

describe('aller-retour', () => {
  it.each([
    ['titres et paragraphe', '# Titre\n\nDu texte.'],
    ['liste à puces', '- un\n- deux'],
    ['liste ordonnée', '1. un\n2. deux'],
    ['citation', '> une citation'],
    ['code avec langage', '```ts\nconst a = 1;\n```'],
    ['JSX', '<Accordion title="Détails">\n  Contenu\n</Accordion>'],
    ['Callout info', '<Callout type="info">\n  Note\n</Callout>'],
    ['Callout warning', '<Callout type="warning">\n  Attention\n</Callout>'],
    ['Callout danger', '<Callout type="danger">\n  Interdit\n</Callout>'],
    ['Callout success', '<Callout type="success">\n  Réussi\n</Callout>'],
    ['Callout multiligne et inline', '<Callout type="info">\n  Voir [[page]]\n  et `code` en **gras**\n</Callout>'],
    ['Callout vide', '<Callout type="info">\n  \n</Callout>'],
    ['Callout complexe (brut)', '<Callout type="info">\n  - a\n  - b\n</Callout>'],
    ['tableau', '| a | b |\n|---|---|\n| 1 | 2 |'],
    ['gras et italique', 'Du **gras** et de l’*italique*.'],
    ['code inline', 'Voir `npm run tauri dev` pour lancer.'],
    ['lien', 'Voir [la doc](https://example.org).'],
    ['wiki-link', 'Voir [[dossier/page|libellé]] et [[autre]].'],
    ['séparateur', '---'],
  ])('préserve %s', (_label, source) => {
    expect(roundTrip(source)).toBe(source);
  });

  it('préserve un document composite', () => {
    const source = [
      '# Guide',
      '',
      'Un paragraphe avec **gras**, `code` et [[un-lien]].',
      '',
      '- premier',
      '- second',
      '',
      '<Callout type="info">',
      '  Note importante',
      '</Callout>',
      '',
      '```bash',
      'npm run tauri dev',
      '```',
    ].join('\n');

    expect(roundTrip(source)).toBe(source);
  });
});

describe('inline markdown <-> html', () => {
  it('échappe le HTML pour rendre la conversion réversible', () => {
    const source = 'Un <Badge/> au fil du texte.';
    expect(htmlToMarkdown(markdownToHtml(source))).toBe(source);
  });

  it('ne met pas en gras à l’intérieur d’un span de code', () => {
    const html = markdownToHtml('`a ** b`');
    expect(html).not.toContain('<b>');
    expect(htmlToMarkdown(html)).toBe('`a ** b`');
  });

  it('convertit les balises produites par Editor.js', () => {
    expect(htmlToMarkdown('<b>gras</b> et <i>italique</i>')).toBe('**gras** et *italique*');
    expect(htmlToMarkdown('<a href="https://x.org">lien</a>')).toBe('[lien](https://x.org)');
    expect(htmlToMarkdown('ligne<br>suite')).toBe('ligne\nsuite');
  });

  it('déplie les imbrications', () => {
    expect(htmlToMarkdown('<b><i>les deux</i></b>')).toBe('***les deux***');
  });
});
