import { describe, expect, it } from 'vitest';

import { undoShortcut } from './undo';

const key = (
  key: string,
  modifiers: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
) => ({
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  key,
  ...modifiers,
});

describe('undoShortcut', () => {
  it('annule avec Ctrl+Z', () => {
    expect(undoShortcut(key('z'))).toBe('undo');
  });

  it('rétablit avec Ctrl+Y et Ctrl+Maj+Z', () => {
    expect(undoShortcut(key('y'))).toBe('redo');
    expect(undoShortcut(key('Z', { shiftKey: true }))).toBe('redo');
  });

  it('tolère le verrouillage des majuscules', () => {
    // `key` arrive en majuscule sans que Maj soit tenu.
    expect(undoShortcut(key('Z'))).toBe('undo');
    expect(undoShortcut(key('Y'))).toBe('redo');
  });

  it('ignore les autres combinaisons', () => {
    expect(undoShortcut(key('z', { ctrlKey: false }))).toBeNull();
    expect(undoShortcut(key('z', { altKey: true }))).toBeNull();
    expect(undoShortcut(key('Y', { shiftKey: true }))).toBeNull();
    expect(undoShortcut(key('s'))).toBeNull();
  });
});
