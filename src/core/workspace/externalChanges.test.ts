import { describe, expect, it } from 'vitest';

import { reconcileWithDisk } from './externalChanges';

describe('reconcileWithDisk', () => {
  it('ne fait rien quand le disque correspond à la version connue', () => {
    expect(reconcileWithDisk({ draft: 'a', persisted: 'a', disk: 'a' })).toEqual({ kind: 'none' });
    expect(reconcileWithDisk({ draft: 'b', persisted: 'a', disk: 'a' })).toEqual({ kind: 'none' });
  });

  it('recharge un brouillon intact quand le disque a changé', () => {
    expect(reconcileWithDisk({ draft: 'a', persisted: 'a', disk: 'z' })).toEqual({
      kind: 'reload',
      disk: 'z',
    });
  });

  it('prend acte quand le disque contient déjà le brouillon', () => {
    expect(reconcileWithDisk({ draft: 'b', persisted: 'a', disk: 'b' })).toEqual({
      kind: 'adopt',
      disk: 'b',
    });
  });

  it('signale un conflit quand brouillon et disque ont divergé', () => {
    expect(reconcileWithDisk({ draft: 'b', persisted: 'a', disk: 'z' })).toEqual({
      kind: 'conflict',
      disk: 'z',
    });
  });

  it('ignore une simple conversion des fins de ligne', () => {
    expect(reconcileWithDisk({ draft: 'b', persisted: 'x\ny', disk: 'x\r\ny' })).toEqual({
      kind: 'none',
    });
  });
});
