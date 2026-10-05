import { describe, expect, it } from 'vitest';

import { blocksToMdx, mdxToBlocks } from './MDXEditorConverter';
import {
  findToggleTags,
  indexToggles,
  parseToggleLine,
  serializeToggle,
  setToggleChecked,
} from './toggles';

describe('parseToggleLine / serializeToggle', () => {
  it('lit la forme canonique, cochée ou non', () => {
    expect(parseToggleLine('<Toggle label="Relire" />')).toEqual({ label: 'Relire', checked: false });
    expect(parseToggleLine('<Toggle label="Relire" defaultOn />')).toEqual({
      label: 'Relire',
      checked: true,
    });
  });

  it('ignore les formes non canoniques, qui restent en MDX brut', () => {
    expect(parseToggleLine('<Toggle label="a" defaultOn={true} />')).toBeNull();
    expect(parseToggleLine('<Toggle label="a" id="x" />')).toBeNull();
    expect(parseToggleLine('<Toggle label="a"/>')).toBeNull();
    expect(parseToggleLine('  <Toggle label="a" />')).toBeNull();
  });

  it('fait un aller-retour exact, guillemets et esperluettes compris', () => {
    for (const line of [
      '<Toggle label="R&D" />',
      '<Toggle label="Dire &quot;oui&quot;" defaultOn />',
      '<Toggle label="" />',
    ]) {
      expect(serializeToggle(parseToggleLine(line)!)).toBe(line);
    }
  });
});

describe('convertisseur WYSIWYG', () => {
  it('produit un bloc toggle et le réécrit à l’identique', () => {
    const source = 'Avant\n\n<Toggle label="Relire" defaultOn />\n\n<Toggle label="Publier" />\n';
    const blocks = mdxToBlocks(source);

    expect(blocks.filter((block) => block.type === 'toggle')).toEqual([
      { type: 'toggle', data: { label: 'Relire', checked: true } },
      { type: 'toggle', data: { label: 'Publier', checked: false } },
    ]);
    expect(blocksToMdx(blocks)).toBe(source);
  });

  it('écrit l’état coché modifié dans l’éditeur', () => {
    const mdx = blocksToMdx([{ type: 'toggle', data: { label: 'Relire', checked: true } }]);
    expect(mdx).toBe('<Toggle label="Relire" defaultOn />\n');
  });
});

describe('setToggleChecked', () => {
  const source = [
    '<Toggle label="Un" />',
    '',
    '```mdx',
    '<Toggle label="Exemple" />',
    '```',
    '',
    '<Toggle',
    '  label="Deux"',
    '  defaultOn={true}',
    '/>',
  ].join('\n');

  it('ignore les balises situées dans du code', () => {
    expect(findToggleTags(source)).toHaveLength(2);
  });

  it('coche la n-ième case sans toucher au reste', () => {
    const next = setToggleChecked(source, 0, true);
    expect(next.split('\n')[0]).toBe('<Toggle label="Un" defaultOn />');
    expect(next.slice(next.indexOf('\n'))).toBe(source.slice(source.indexOf('\n')));
  });

  it('décoche en retirant toute forme de defaultOn', () => {
    const next = setToggleChecked(source, 1, false);
    expect(next).toContain('<Toggle\n  label="Deux"\n/>');
  });

  it('laisse la source intacte si l’index est inconnu', () => {
    expect(setToggleChecked(source, 5, true)).toBe(source);
  });

  it('numérote les cases pour l’aperçu', () => {
    const indexed = indexToggles(source);
    expect(indexed).toContain('<Toggle __toggleIndex={0} label="Un" />');
    expect(indexed).toContain('<Toggle __toggleIndex={1}\n  label="Deux"');
    expect(indexed).toContain('```mdx\n<Toggle label="Exemple" />');
  });
});
