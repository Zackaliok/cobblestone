import { isDesktop } from './platform';

/**
 * Journalisation des erreurs de l'interface.
 *
 * En desktop, les messages partent dans le fichier de logs de l'application
 * (via `tauri-plugin-log`), qui survit à un crash — contrairement à la console
 * de la webview. Hors Tauri (mode démo), on retombe sur la console.
 */

export function describeUnknown(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function logError(context: string, value: unknown): Promise<void> {
  const message = `${context} : ${describeUnknown(value)}`;
  console.error(message);

  if (!isDesktop()) return;
  try {
    const { error } = await import('@tauri-apps/plugin-log');
    await error(message);
  } catch {
    // Si le journal lui-même est inaccessible, la console aura le dernier mot.
  }
}

let installed = false;

/** Capte les erreurs qui échappent à tout `try/catch` et à React. */
export function installGlobalDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : '';
    void logError(`Erreur non interceptée${where}`, event.error ?? event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    void logError('Promesse rejetée sans gestionnaire', event.reason);
  });
}
