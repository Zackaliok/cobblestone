import { create } from 'zustand';

import { isDesktop } from '../platform';
import { DEFAULT_ZOOM, clampZoom, stepZoom } from '../zoom';

const STORAGE_KEY = 'cobblestone.zoom';

interface ZoomState {
  level: number;
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
}

/**
 * Zoom de l'interface entière, comme celui d'un navigateur.
 *
 * Dans Tauri, c'est le zoom natif de la webview : la mise en page est recalculée
 * comme si l'écran était plus petit, sans flou. Dans le navigateur (mode
 * démonstration), on se rabat sur la propriété CSS `zoom`, équivalente ici.
 *
 * Le niveau est une préférence d'affichage, propre au poste : `localStorage`
 * suffit, et sa perte éventuelle ne coûte qu'un retour à 100 %.
 */
export const useZoomStore = create<ZoomState>()((set, get) => {
  const update = (level: number) => {
    set({ level });
    void applyZoom(level);
    try {
      localStorage.setItem(STORAGE_KEY, String(level));
    } catch {
      // Stockage indisponible : le zoom vaut pour la session seulement.
    }
  };

  return {
    level: DEFAULT_ZOOM,
    zoomIn: () => update(stepZoom(get().level, 1)),
    zoomOut: () => update(stepZoom(get().level, -1)),
    reset: () => update(DEFAULT_ZOOM),
  };
});

/** Restaure le niveau mémorisé. À appeler une fois, au démarrage. */
export function restoreZoom(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (saved === null) return;

  const level = clampZoom(Number(saved));
  useZoomStore.setState({ level });
  void applyZoom(level);
}

async function applyZoom(level: number): Promise<void> {
  if (isDesktop()) {
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview().setZoom(level);
      return;
    } catch {
      // Permission absente ou webview trop ancienne : repli CSS ci-dessous.
    }
  }
  document.documentElement.style.setProperty('zoom', String(level));
}
