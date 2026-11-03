/**
 * Préférence de repli du panneau bas (liens, orphelines, récents).
 *
 * Replié par défaut : le panneau sert ponctuellement, il n'a pas à prendre de
 * la hauteur sur l'éditeur tant qu'on ne l'a pas demandé. Une fois que
 * l'utilisateur l'a déplié ou replié, on retient son choix d'un lancement à
 * l'autre.
 *
 * Comme le zoom, c'est une préférence d'affichage propre au poste :
 * `localStorage` suffit, et sa perte ne coûte qu'un retour au défaut.
 */

export const BOTTOM_PANEL_STORAGE_KEY = 'cobblestone.bottomPanel.collapsed';

export const DEFAULT_BOTTOM_PANEL_COLLAPSED = true;

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): PreferenceStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accès refusé (stockage désactivé, contexte isolé…).
    return null;
  }
}

/** État mémorisé, ou le défaut si rien n'a été retenu ou si la valeur est illisible. */
export function loadBottomPanelCollapsed(
  storage: PreferenceStorage | null = defaultStorage(),
): boolean {
  let saved: string | null = null;
  try {
    saved = storage?.getItem(BOTTOM_PANEL_STORAGE_KEY) ?? null;
  } catch {
    return DEFAULT_BOTTOM_PANEL_COLLAPSED;
  }
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  return DEFAULT_BOTTOM_PANEL_COLLAPSED;
}

export function saveBottomPanelCollapsed(
  collapsed: boolean,
  storage: PreferenceStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(BOTTOM_PANEL_STORAGE_KEY, String(collapsed));
  } catch {
    // Stockage indisponible : le choix vaut pour la session seulement.
  }
}
