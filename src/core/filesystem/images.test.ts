import { describe, expect, it } from 'vitest';

import { blocksToMdx, mdxToBlocks } from '../parser/MDXEditorConverter';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { imageMimeType, isImageFile, resolveImagePath } from './FileSystem';
import { MemoryFileSystem } from './MemoryFileSystem';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('détection des images', () => {
  it('reconnaît png, jpg et jpeg, quelle que soit la casse', () => {
    expect(isImageFile('a.png')).toBe(true);
    expect(isImageFile('A.JPG')).toBe(true);
    expect(imageMimeType('photo.jpeg')).toBe('image/jpeg');
    expect(isImageFile('schema.svg')).toBe(false);
    expect(isImageFile('note.mdx')).toBe(false);
  });
});

describe('resolveImagePath', () => {
  it('résout relativement au dossier de la note', () => {
    expect(resolveImagePath('guides/install.mdx', 'img/a.png')).toBe('guides/img/a.png');
    expect(resolveImagePath('guides/install.mdx', './a.png')).toBe('guides/a.png');
    expect(resolveImagePath('guides/install.mdx', '../assets/a.png')).toBe('assets/a.png');
  });

  it('résout un chemin absolu depuis la racine du workspace', () => {
    expect(resolveImagePath('guides/install.mdx', '/assets/a.png')).toBe('assets/a.png');
  });

  it('décode les espaces encodés', () => {
    expect(resolveImagePath('index.mdx', 'mon%20image.png')).toBe('mon image.png');
  });

  it('écarte les URL et les chemins hors du workspace', () => {
    expect(resolveImagePath('index.mdx', 'https://exemple.fr/a.png')).toBeNull();
    expect(resolveImagePath('index.mdx', 'data:image/png;base64,AAAA')).toBeNull();
    expect(resolveImagePath('index.mdx', '//cdn.exemple.fr/a.png')).toBeNull();
    expect(resolveImagePath('index.mdx', '../../a.png')).toBeNull();
    expect(resolveImagePath('index.mdx', '')).toBeNull();
  });
});

describe('workspace avec des images', () => {
  const setup = () => {
    const manager = new WorkspaceManager();
    manager.attach(
      'w',
      new MemoryFileSystem('memory://w', {
        'index.mdx': '# Accueil\n\n![Logo](img/logo.png)\n',
        'img/logo.png': PNG,
        'img/notes.txt': 'ignoré',
      }),
    );
    return manager;
  };

  it("montre les images dans l'arborescence sans en faire des notes", async () => {
    const result = await setup().scan('w');
    expect(result.tree.map((entry) => entry.path)).toEqual(['img', 'index.mdx']);
    expect(result.tree[0]!.children!.map((entry) => entry.path)).toEqual(['img/logo.png']);
    expect(result.notes.map((note) => note.path)).toEqual(['index.mdx']);
    expect(result.failures).toEqual([]);
  });

  it('lit le contenu binaire', async () => {
    expect(await setup().readBinary('w', 'img/logo.png')).toEqual(PNG);
  });

  it("garde l'extension d'une image renommée", async () => {
    expect(await setup().renameNote('w', 'img/logo.png', 'img/marque.png')).toBe('img/marque.png');
    expect(await setup().renameNote('w', 'index.mdx', 'accueil')).toBe('accueil.mdx');
  });
});

describe('images dans le WYSIWYG', () => {
  it('fait un bloc image d’une image seule, réécrit à l’identique', () => {
    const source = '# Titre\n\n![Le logo](img/logo.png)\n\nTexte.\n';
    const blocks = mdxToBlocks(source);
    expect(blocks[1]).toEqual({ type: 'image', data: { alt: 'Le logo', src: 'img/logo.png' } });
    expect(blocksToMdx(blocks)).toBe(source);
  });

  it('laisse en texte les images avec titre, au fil du texte ou collées à un paragraphe', () => {
    for (const source of [
      '![a](b.png "titre")\n',
      'Voir ![a](b.png) ici.\n',
      '![a](b.png)\nLégende collée.\n',
    ]) {
      expect(mdxToBlocks(source).some((block) => block.type === 'image')).toBe(false);
      expect(blocksToMdx(mdxToBlocks(source))).toBe(source);
    }
  });

  it('n’écrit rien pour un bloc image laissé vide', () => {
    expect(blocksToMdx([{ type: 'image', data: { src: '', alt: '' } }])).toBe('\n');
  });
});
