import { saveRecovery, type RecoveredDraft } from './persistence';
import { useDocStore } from './store/DocStore';

/**
 * Sauvegarde de secours du brouillon en cours.
 *
 * L'enregistrement reste manuel (Ctrl+S) : on ne réécrit jamais le fichier du
 * workspace dans le dos de l'utilisateur. En revanche, tant que le brouillon
 * diffère du disque, on en garde une copie à part, pour qu'un crash ne coûte
 * plus les modifications en cours.
 */

/**
 * Assez court pour qu'un crash natif — que rien ne permet d'intercepter — ne
 * coûte que la dernière seconde de frappe.
 */
const DEBOUNCE_MS = 1000;

function currentRecovery(): RecoveredDraft | null {
  const { open, draft, persisted } = useDocStore.getState();
  if (!open || draft === persisted) return null;
  return { workspaceId: open.workspaceId, path: open.path, draft, savedAt: Date.now() };
}

/** Écrit immédiatement la copie de secours (utilisé quand l'UI vient de planter). */
export async function flushRecovery(): Promise<void> {
  const recovery = currentRecovery();
  if (recovery) await saveRecovery(recovery);
}

export function startRecoveryAutosave(): () => void {
  let timer: number | undefined;
  let wasDirty = false;

  const unsubscribe = useDocStore.subscribe((state, previous) => {
    if (state.draft === previous.draft && state.persisted === previous.persisted && state.open === previous.open) {
      return;
    }

    const dirty = Boolean(state.open) && state.draft !== state.persisted;
    window.clearTimeout(timer);

    if (dirty) {
      wasDirty = true;
      timer = window.setTimeout(() => void flushRecovery(), DEBOUNCE_MS);
    } else if (wasDirty) {
      // Enregistré, ou brouillon abandonné : la copie de secours est caduque.
      wasDirty = false;
      void saveRecovery(null);
    }
  });

  // Fenêtre quittée ou masquée : c'est souvent le dernier moment où l'on
  // garde la main (fermeture, mise en veille, crash du compositeur…).
  const flushNow = () => {
    if (!currentRecovery()) return;
    window.clearTimeout(timer);
    void flushRecovery();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushNow();
  };
  window.addEventListener('blur', flushNow);
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('blur', flushNow);
    window.removeEventListener('pagehide', flushNow);
    document.removeEventListener('visibilitychange', onVisibility);
    unsubscribe();
  };
}
