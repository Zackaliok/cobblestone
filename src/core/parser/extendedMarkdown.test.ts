import { compile } from '@mdx-js/mdx';
import { defListHastHandlers, remarkDefinitionList } from 'remark-definition-list';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import {
  escapeHeadingIds,
  findTaskMarkers,
  rehypeTaskListIndex,
  remarkExtendedMarkdown,
  setTaskChecked,
} from './extendedMarkdown';
import { blocksToMdx, mdxToBlocks } from './MDXEditorConverter';
import { extractHeadings } from './MDXParser';

/** Compile comme l'aperçu, et renvoie le JavaScript produit. */
async function render(source: string): Promise<string> {
  const output = await compile(escapeHeadingIds(source), {
    remarkPlugins: [[remarkGfm, { singleTilde: false }], remarkDefinitionList, remarkExtendedMarkdown],
    rehypePlugins: [rehypeTaskListIndex],
    remarkRehypeOptions: { handlers: defListHastHandlers },
  });
  return String(output);
}

describe('rendu de la syntaxe étendue', () => {
  it('surligne, met en indice et en exposant', async () => {
    const js = await render('Un ==mot== dans H~2~O et x^2^, ~~barré~~.');
    expect(js).toContain('_components.mark');
    expect(js).toContain('_components.sub');
    expect(js).toContain('_components.sup');
    expect(js).toContain('_components.del');
  });

  it('ne touche pas au code', async () => {
    const js = await render('`==pas surligné==`');
    expect(js).not.toContain('_components.mark');
  });

  it('applique les identifiants de titre explicites', async () => {
    const js = await render('## Mon titre {#ancre-perso}');
    expect(js).toContain('id: "ancre-perso"');
    expect(js).toContain('"Mon titre"');
  });

  it('rend tableaux, notes, listes de définitions et tâches cliquables', async () => {
    const js = await render(
      '| a | b |\n|---|---|\n| 1 | 2 |\n\nTexte[^1]\n\n[^1]: Note.\n\nTerme\n: Définition\n\n- [ ] à faire\n- [x] fait\n',
    );
    expect(js).toContain('_components.table');
    expect(js).toContain('footnote');
    expect(js).toContain('_components.dl');
    expect(js).toContain('"data-task-index": "0"');
    expect(js).toContain('"data-task-index": "1"');
    expect(js).not.toContain('disabled');
  });
});

describe('escapeHeadingIds', () => {
  it('échappe les accolades des titres, pas celles du code', () => {
    const source = '# Titre {#a}\n\n```md\n# Exemple {#b}\n```\n\nTexte {#c}';
    expect(escapeHeadingIds(source)).toBe(
      '# Titre \\{#a\\}\n\n```md\n# Exemple {#b}\n```\n\nTexte {#c}',
    );
  });

  it('alimente aussi l’index des titres', () => {
    expect(extractHeadings('## Mon titre {#ancre}')).toEqual([
      { level: 2, text: 'Mon titre', slug: 'ancre' },
    ]);
  });
});

describe('listes de tâches', () => {
  const source = [
    '- [ ] un',
    '- [x] deux',
    '',
    '```md',
    '- [ ] exemple',
    '```',
    '',
    '> 1. [X] trois',
    '- [ ]',
  ].join('\n');

  it('repère les cases hors code, y compris en citation', () => {
    expect(findTaskMarkers(source).map((marker) => marker.checked)).toEqual([false, true, true]);
  });

  it('coche et décoche sans toucher au reste', () => {
    expect(setTaskChecked(source, 0, true).split('\n')[0]).toBe('- [x] un');
    expect(setTaskChecked(source, 2, false).split('\n')[7]).toBe('> 1. [ ] trois');
    expect(setTaskChecked(source, 1, true)).toBe(source);
    expect(setTaskChecked(source, 9, true)).toBe(source);
  });

  it('devient un bloc checklist dans le WYSIWYG, réécrit à l’identique', () => {
    const markdown = '- [ ] un\n- [x] **deux**\n';
    const blocks = mdxToBlocks(markdown);
    expect(blocks).toEqual([
      {
        type: 'checklist',
        data: {
          items: [
            { text: 'un', checked: false },
            { text: '<b>deux</b>', checked: true },
          ],
        },
      },
    ]);
    expect(blocksToMdx(blocks)).toBe(markdown);
  });

  it('laisse les variantes en liste ordinaire', () => {
    expect(mdxToBlocks('* [X] un\n* [ ] deux')[0]!.type).toBe('list');
    expect(blocksToMdx(mdxToBlocks('* [X] un\n* [ ] deux'))).toBe('- [X] un\n- [ ] deux\n');
  });
});
