/**
 * Détection de l'environnement d'exécution.
 *
 * L'application est conçue pour Tauri. Mais `npm run dev` seul (sans toolchain
 * Rust) ouvre la même interface dans un navigateur : c'est le mode
 * « démonstration », adossé à un `MemoryFileSystem`, qui permet de travailler
 * l'UI sans compiler Rust. Aucun accès disque n'y est possible.
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function assertDesktop(action: string): void {
  if (!isDesktop()) {
    throw new Error(
      `${action} nécessite l'application desktop. Lancez « npm run tauri dev ».`,
    );
  }
}
