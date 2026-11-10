import { describe, expect, it } from 'vitest';

import { changesWorkspace } from './watchEvents';

const ROOT = '/home/user/docs';

function event(type: unknown, ...paths: string[]) {
  return { type, paths };
}

describe('changesWorkspace', () => {
  it('ignore les ouvertures et lectures, que le scan produit lui-même (#44)', () => {
    expect(changesWorkspace(event({ access: { kind: 'open', mode: 'any' } }, `${ROOT}/a.md`), ROOT)).toBe(false);
    expect(changesWorkspace(event({ access: { kind: 'close', mode: 'read' } }, `${ROOT}/a.md`), ROOT)).toBe(false);
    expect(changesWorkspace(event({ access: { kind: 'any' } }, `${ROOT}/a.md`), ROOT)).toBe(false);
    expect(changesWorkspace(event({ access: { kind: 'open', mode: 'any' } }, `${ROOT}/sub`), ROOT)).toBe(false);
  });

  it('garde la fin d’une écriture', () => {
    expect(changesWorkspace(event({ access: { kind: 'close', mode: 'write' } }, `${ROOT}/a.md`), ROOT)).toBe(true);
  });

  it('garde les écritures, créations, suppressions et renommages', () => {
    expect(changesWorkspace(event({ modify: { kind: 'data', mode: 'any' } }, `${ROOT}/a.md`), ROOT)).toBe(true);
    expect(changesWorkspace(event({ modify: { kind: 'metadata', mode: 'any' } }, `${ROOT}/a.md`), ROOT)).toBe(true);
    expect(changesWorkspace(event({ create: { kind: 'folder' } }, `${ROOT}/nouveau`), ROOT)).toBe(true);
    expect(changesWorkspace(event({ remove: { kind: 'file' } }, `${ROOT}/a.md`), ROOT)).toBe(true);
    expect(
      changesWorkspace(
        event({ modify: { kind: 'rename', mode: 'both' } }, `${ROOT}/a.md`, `${ROOT}/b.md`),
        ROOT,
      ),
    ).toBe(true);
  });

  it('garde les évènements sans détail : un scan de trop vaut mieux qu’un arbre périmé', () => {
    expect(changesWorkspace(event('any', `${ROOT}/a.md`), ROOT)).toBe(true);
    expect(changesWorkspace(event('other'), ROOT)).toBe(true);
    expect(changesWorkspace(event({ modify: { kind: 'any' } }), ROOT)).toBe(true);
  });

  it('ignore ce que le scan ne parcourt pas', () => {
    const write = { modify: { kind: 'data', mode: 'any' } };
    expect(changesWorkspace(event(write, `${ROOT}/.git/index`), ROOT)).toBe(false);
    expect(changesWorkspace(event(write, `${ROOT}/site/node_modules/x/README.md`), ROOT)).toBe(false);
    expect(changesWorkspace(event({ create: { kind: 'folder' } }, `${ROOT}/node_modules`), ROOT)).toBe(false);
    expect(changesWorkspace(event(write, `${ROOT}/.obsidian/workspace.json`), ROOT)).toBe(false);
    expect(changesWorkspace(event(write, `${ROOT}/guide/.guide.md.swp`), ROOT)).toBe(false);
  });

  it('garde un document caché, que le scan remonte', () => {
    expect(changesWorkspace(event({ create: { kind: 'file' } }, `${ROOT}/.brouillon.md`), ROOT)).toBe(true);
  });

  it('garde un évènement si au moins un de ses chemins compte', () => {
    expect(
      changesWorkspace(
        event({ modify: { kind: 'rename', mode: 'both' } }, `${ROOT}/.cache/a.md`, `${ROOT}/a.md`),
        ROOT,
      ),
    ).toBe(true);
  });

  it('garde la racine elle-même et tout chemin hors racine', () => {
    expect(changesWorkspace(event({ remove: { kind: 'folder' } }, ROOT), ROOT)).toBe(true);
    expect(changesWorkspace(event({ remove: { kind: 'file' } }, '/ailleurs/.git/x'), ROOT)).toBe(true);
  });

  it('compare les chemins Windows en séparateurs POSIX', () => {
    const root = 'C:/Users/moi/docs';
    expect(
      changesWorkspace(event({ modify: { kind: 'any' } }, 'C:\\Users\\moi\\docs\\.git\\index'), root),
    ).toBe(false);
    expect(
      changesWorkspace(event({ modify: { kind: 'any' } }, 'C:\\Users\\moi\\docs\\guide.md'), root),
    ).toBe(true);
  });
});
