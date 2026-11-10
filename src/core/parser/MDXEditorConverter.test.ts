import { describe, expect, it } from 'vitest';

import {
  blocksToMdx,
  htmlToMarkdown,
  markdownToHtml,
  mdxToBlocks,
  mermaidFenceSource,
  type EditorBlock,
  type TableData,
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

  it('reconnaît un tableau GFM comme bloc éditable', () => {
    const source = '| a | **b** |\n|---|---|\n| 1 | 2 |';
    expect(mdxToBlocks(source)).toEqual([
      {
        type: 'table',
        data: {
          withHeadings: true,
          content: [
            ['a', '<b>b</b>'],
            ['1', '2'],
          ],
          align: [null, null],
          source: source.split('\n'),
        },
      },
    ]);
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

describe('tableaux', () => {
  const table = (source: string): TableData => {
    const [block] = mdxToBlocks(source);
    expect(block?.type).toBe('table');
    return (block as Extract<EditorBlock, { type: 'table' }>).data;
  };

  /** Le tableau tel que l'éditeur le rendrait après modification. */
  const write = (data: TableData): string =>
    blocksToMdx([{ type: 'table', data }]).trim();

  it('lit l’alignement de chaque colonne', () => {
    expect(table('| a | b | c | d |\n| :--- | :---: | ---: | --- |').align).toEqual([
      'left',
      'center',
      'right',
      null,
    ]);
  });

  it('traite une ligne d’en-tête vide comme un tableau sans en-tête', () => {
    const data = table('|  |  |\n|---|---|\n| 1 | 2 |');
    expect(data.withHeadings).toBe(false);
    expect(data.content).toEqual([['1', '2']]);
  });

  it('complète les lignes trop courtes', () => {
    expect(table('| a | b |\n|---|---|\n| 1 |').content).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]);
  });

  it('accepte des lignes sans pipe final', () => {
    expect(table('| a | b\n|---|---\n| 1 | 2').content).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('affiche un pipe échappé comme un simple pipe', () => {
    expect(table('| a \\| b | `x \\| y` |\n|---|---|').content).toEqual([
      ['a | b', '<code class="inline-code">x | y</code>'],
    ]);
  });

  it('ne coupe pas une cellule au pipe d’un wiki-link', () => {
    expect(table('| [[page|libellé]] | b |\n|---|---|').content).toEqual([
      ['[[page|libellé]]', 'b'],
    ]);
  });

  it('change un <br> en saut de ligne, sauf dans du code', () => {
    expect(table('| un<br>deux | `<br>` |\n|---|---|').content).toEqual([
      ['un<br>deux', '<code class="inline-code">&lt;br&gt;</code>'],
    ]);
  });

  it.each([
    ['sans ligne de séparation', '| a | b |\n| 1 | 2 |'],
    ['séparation invalide', '| a | b |\n|---|-x-|'],
    ['séparation plus courte que l’en-tête', '| a | b |\n|---|'],
    ['ligne plus large que l’en-tête', '| a | b |\n|---|---|\n| 1 | 2 | 3 |'],
    ['lignes indentées', '  | a | b |\n  |---|---|'],
    ['en-tête seul', '| a | b |'],
  ])('garde le tableau en MDX brut : %s', (_label, source) => {
    expect(mdxToBlocks(source)).toEqual([{ type: 'mdx', data: { code: source } }]);
  });

  it.each([
    ['aligné', '| Syntaxe | Rendu | Droite |\n| :--- | :---: | ---: |\n| `~~x~~` | ~~x~~ | 1 |'],
    ['colonnes alignées', '| Nom   | Âge |\n| ----- | --- |\n| Alice | 30  |'],
    ['sans pipes finaux', '| a | b\n|---|---\n| 1 | 2'],
    ['ligne courte', '| a | b |\n|---|---|\n| 1 |'],
    ['sans en-tête', '|  |  |\n|---|---|\n| 1 | 2 |'],
    ['en-tête seul', '| a | b |\n|---|---|'],
    ['ligne vide', '| a | b |\n|---|---|\n|  |  |'],
    ['lignes en double', '| a |\n|---|\n| x |\n| x |'],
    ['pipes échappés', '| a \\| b | `x \\| y` |\n|---|---|'],
    ['wiki-link avec libellé', '| [[page|libellé]] | [[autre]] |\n|---|---|'],
    ['saut de ligne', '| un<br>deux | trois<br/>quatre |\n|---|---|'],
    ['gras en soulignés', '| __gras__ | _italique_ |\n|---|---|'],
    ['espace insécable', '| 10\u00a0€ | b |\n|---|---|'],
    ['JSX au fil du texte', '| <Badge /> | {1 + 1} |\n|---|---|'],
  ])('préserve un tableau %s', (_label, source) => {
    expect(roundTrip(source)).toBe(source);
  });

  it('ne réécrit que la ligne modifiée', () => {
    const data = table('| Nom   | Âge |\n| ----- | --- |\n| Alice | 30  |\n| Bob   | 25  |');
    data.content[1]![1] = '31';

    expect(write(data)).toBe('| Nom   | Âge |\n| ----- | --- |\n| Alice | 31 |\n| Bob   | 25  |');
  });

  it('réécrit chaque ligne quand une colonne est ajoutée', () => {
    const data = table('| a | b |\n| :-- | --: |\n| 1 | 2 |');
    data.content = data.content.map((row) => [...row, '']);
    data.align = [...data.align!, null];

    expect(write(data)).toBe('| a | b |  |\n| :--- | ---: | --- |\n| 1 | 2 |  |');
  });

  it('écrit un tableau neuf sous forme canonique', () => {
    expect(
      write({
        withHeadings: true,
        content: [
          ['Nom', '<b>Rôle</b>'],
          ['Alice', ''],
        ],
      }),
    ).toBe('| Nom | **Rôle** |\n| --- | --- |\n| Alice |  |');
  });

  it('écrit une ligne d’en-tête vide pour un tableau sans en-tête', () => {
    expect(write({ withHeadings: false, content: [['1', '2']] })).toBe(
      '|  |  |\n| --- | --- |\n| 1 | 2 |',
    );
  });

  it('échappe les pipes et convertit les sauts de ligne', () => {
    expect(
      write({ withHeadings: true, content: [['a | b', 'un<br>deux<br>', '[[page|libellé]]']] }),
    ).toBe('| a \\| b | un<br />deux | [[page|libellé]] |\n| --- | --- | --- |');
  });

  it('ne produit rien pour un tableau vidé', () => {
    expect(blocksToMdx([{ type: 'table', data: { withHeadings: true, content: [] } }])).toBe('\n');
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

describe('mermaidFenceSource', () => {
  it('extrait le diagramme d\'un bloc ```mermaid', () => {
    expect(mermaidFenceSource('```mermaid\nflowchart LR\n  A --> B\n```')).toBe(
      'flowchart LR\n  A --> B',
    );
  });

  it('accepte les tildes, une info string et les fins de ligne Windows', () => {
    expect(mermaidFenceSource('~~~mermaid\npie\n~~~')).toBe('pie');
    expect(mermaidFenceSource('``` mermaid title="Flux"\npie\n```')).toBe('pie');
    expect(mermaidFenceSource('```mermaid\r\npie\r\n```\r\n')).toBe('pie');
  });

  it('ignore les autres langages', () => {
    expect(mermaidFenceSource('```ts\nconst a = 1;\n```')).toBeNull();
    expect(mermaidFenceSource('```mermaidjs\npie\n```')).toBeNull();
    expect(mermaidFenceSource('```mermaid `x`\npie\n```')).toBeNull();
    expect(mermaidFenceSource('<Callout>\n```mermaid\npie\n```\n</Callout>')).toBeNull();
  });

  it('ignore un bloc qui contient autre chose que le diagramme', () => {
    expect(mermaidFenceSource('```mermaid\npie\n```\n\nTexte')).toBeNull();
  });

  it('ne referme la fence que sur le même délimiteur, au moins aussi long', () => {
    expect(mermaidFenceSource('````mermaid\npie\n```\n~~~~\n````')).toBe('pie\n```\n~~~~');
  });

  it('reconnaît une fence pas encore refermée', () => {
    expect(mermaidFenceSource('```mermaid\nflowchart LR')).toBe('flowchart LR');
    expect(mermaidFenceSource('```mermaid')).toBe('');
  });
});
