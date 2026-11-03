import { describe, expect, it } from 'vitest';

import {
  BOTTOM_PANEL_STORAGE_KEY,
  loadBottomPanelCollapsed,
  saveBottomPanelCollapsed,
} from './bottomPanel';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const failingStorage = {
  getItem: (): string | null => {
    throw new Error('stockage indisponible');
  },
  setItem: (): void => {
    throw new Error('stockage indisponible');
  },
};

describe('préférence du panneau bas', () => {
  it('est replié par défaut', () => {
    expect(loadBottomPanelCollapsed(memoryStorage())).toBe(true);
  });

  it('retient le choix de l’utilisateur', () => {
    const storage = memoryStorage();

    saveBottomPanelCollapsed(false, storage);
    expect(loadBottomPanelCollapsed(storage)).toBe(false);

    saveBottomPanelCollapsed(true, storage);
    expect(loadBottomPanelCollapsed(storage)).toBe(true);
  });

  it('retombe sur le défaut si la valeur mémorisée est illisible', () => {
    const storage = memoryStorage({ [BOTTOM_PANEL_STORAGE_KEY]: 'peut-être' });
    expect(loadBottomPanelCollapsed(storage)).toBe(true);
  });

  it('ne casse rien quand le stockage est indisponible', () => {
    expect(loadBottomPanelCollapsed(failingStorage)).toBe(true);
    expect(() => saveBottomPanelCollapsed(false, failingStorage)).not.toThrow();
    expect(loadBottomPanelCollapsed(null)).toBe(true);
    expect(() => saveBottomPanelCollapsed(false, null)).not.toThrow();
  });

  it('se rabat sur le défaut hors navigateur, sans stockage global', () => {
    expect(loadBottomPanelCollapsed()).toBe(true);
    expect(() => saveBottomPanelCollapsed(false)).not.toThrow();
  });
});
