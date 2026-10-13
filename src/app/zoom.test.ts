import { describe, expect, it } from 'vitest';

import { clampZoom, formatZoom, stepZoom, zoomShortcut } from './zoom';

const key = (key: string, modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  key,
  ...modifiers,
});

describe('zoom', () => {
  it('avance et recule par paliers, bornés aux extrêmes', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });

  it('retombe sur un palier depuis une valeur intermédiaire', () => {
    expect(stepZoom(1.05, 1)).toBe(1.1);
    expect(stepZoom(1.05, -1)).toBe(1);
  });

  it('borne les valeurs aberrantes', () => {
    expect(clampZoom(10)).toBe(2);
    expect(clampZoom(0)).toBe(0.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('affiche un pourcentage', () => {
    expect(formatZoom(1.25)).toBe('125 %');
    expect(formatZoom(0.67)).toBe('67 %');
  });

  it('reconnaît les raccourcis Ctrl/Cmd', () => {
    expect(zoomShortcut(key('+'))).toBe('in');
    expect(zoomShortcut(key('='))).toBe('in');
    expect(zoomShortcut(key('-'))).toBe('out');
    expect(zoomShortcut(key('0'))).toBe('reset');
    expect(zoomShortcut(key('+', { ctrlKey: false, metaKey: true }))).toBe('in');
    expect(zoomShortcut(key('+', { ctrlKey: false }))).toBeNull();
    expect(zoomShortcut(key('+', { altKey: true }))).toBeNull();
    expect(zoomShortcut(key('s'))).toBeNull();
  });
});
