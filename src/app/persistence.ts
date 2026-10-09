import type { WorkspaceDescriptor } from '../core/workspace/types';
import { isDesktop } from './platform';

/**
 * Persistance de la session : liste des workspaces et dernier état de l'UI.
 *
 * En desktop, on écrit via `@tauri-apps/plugin-store` dans le répertoire de
 * données de l'application — et non dans `localStorage`, qui serait purgé avec
 * le cache de la webview, emportant la liste des workspaces avec lui.
 *
 * Attention : ce fichier ne mémorise que des *chemins*. L'autorisation d'accès
 * à ces dossiers, elle, est restaurée séparément par `tauri-plugin-persisted-scope`.
 * Les deux peuvent diverger (dossier déplacé, permission révoquée) : le
 * démarrage doit donc toujours revalider chaque workspace.
 */

const STORE_FILE = 'cobblestone.json';
const BROWSER_KEY = 'cobblestone:session';

export interface PersistedSession {
  workspaces: WorkspaceDescriptor[];
  activeWorkspaceId: string | null;
}

const EMPTY: PersistedSession = { workspaces: [], activeWorkspaceId: null };

type TauriStore = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
};

let storePromise: Promise<TauriStore> | null = null;

async function desktopStore(): Promise<TauriStore> {
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store').then((module) =>
      module.load(STORE_FILE, { autoSave: true }),
    ) as Promise<TauriStore>;
  }
  return storePromise;
}

export async function loadSession(): Promise<PersistedSession> {
  try {
    if (isDesktop()) {
      const store = await desktopStore();
      const session = await store.get<PersistedSession>('session');
      return session ?? EMPTY;
    }

    const raw = window.localStorage.getItem(BROWSER_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : EMPTY;
  } catch {
    // Une session corrompue ne doit pas empêcher le démarrage : on repart vide.
    return EMPTY;
  }
}

export async function saveSession(session: PersistedSession): Promise<void> {
  try {
    if (isDesktop()) {
      const store = await desktopStore();
      await store.set('session', session);
      await store.save();
      return;
    }

    window.localStorage.setItem(BROWSER_KEY, JSON.stringify(session));
  } catch {
    // Perdre la persistance est gênant, pas fatal — on ne bloque pas l'édition.
  }
}

/**
 * Brouillon de secours : copie du texte en cours d'édition, écrite à part de la
 * session. Le fichier du workspace n'est jamais touché — l'utilisateur décide
 * au prochain lancement de restaurer ou non.
 */
export interface RecoveredDraft {
  workspaceId: string;
  path: string;
  draft: string;
  savedAt: number;
}

const RECOVERY_KEY = 'recovery';
const BROWSER_RECOVERY_KEY = 'cobblestone:recovery';

export async function loadRecovery(): Promise<RecoveredDraft | null> {
  try {
    if (isDesktop()) {
      const store = await desktopStore();
      return (await store.get<RecoveredDraft>(RECOVERY_KEY)) ?? null;
    }

    const raw = window.localStorage.getItem(BROWSER_RECOVERY_KEY);
    return raw ? (JSON.parse(raw) as RecoveredDraft) : null;
  } catch {
    return null;
  }
}

export async function saveRecovery(recovery: RecoveredDraft | null): Promise<void> {
  try {
    if (isDesktop()) {
      const store = await desktopStore();
      await store.set(RECOVERY_KEY, recovery);
      await store.save();
      return;
    }

    if (recovery) window.localStorage.setItem(BROWSER_RECOVERY_KEY, JSON.stringify(recovery));
    else window.localStorage.removeItem(BROWSER_RECOVERY_KEY);
  } catch {
    // Le brouillon de secours est un filet : son échec ne doit rien casser.
  }
}
