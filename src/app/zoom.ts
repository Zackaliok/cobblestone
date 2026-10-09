/**
 * Niveaux de zoom, calqués sur ceux des navigateurs : des pas réguliers autour
 * de 100 %, plus espacés aux extrêmes.
 */
export const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export const DEFAULT_ZOOM = 1;

/** Niveau suivant (`+1`) ou précédent (`-1`), borné aux extrêmes. */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_LEVELS.find((level) => level > current + 1e-6) ?? ZOOM_LEVELS.at(-1)!;
  }
  return [...ZOOM_LEVELS].reverse().find((level) => level < current - 1e-6) ?? ZOOM_LEVELS[0];
}

/** Ramène une valeur quelconque (préférence corrompue…) dans les bornes. */
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM;
  return Math.min(Math.max(value, ZOOM_LEVELS[0]), ZOOM_LEVELS.at(-1)!);
}

export function formatZoom(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/**
 * Raccourci clavier correspondant à l'événement, comme dans un navigateur :
 * Ctrl/Cmd + `+` (ou `=`, la même touche sans Maj sur un clavier QWERTY),
 * Ctrl/Cmd + `-`, Ctrl/Cmd + `0`. Pavé numérique compris.
 */
export function zoomShortcut(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  key: string;
}): 'in' | 'out' | 'reset' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (event.key === '+' || event.key === '=') return 'in';
  if (event.key === '-' || event.key === '_') return 'out';
  if (event.key === '0') return 'reset';
  return null;
}
