import { IGNORED_DIRECTORIES, isWorkspaceFile } from './FileSystem';

/**
 * Tri des évènements du watcher de fichiers (#44).
 *
 * Sous Linux, `notify` surveille aussi `IN_OPEN` : une simple *lecture* d'un
 * fichier du workspace produit un évènement `access`. Or chaque évènement
 * déclenchait un scan complet, qui lit tous les fichiers… et produisait donc de
 * nouveaux évènements. La boucle ne s'arrêtait jamais (~1,4 cœur occupé en
 * permanence), et se propageait d'un workspace à l'autre quand ils sont
 * imbriqués. Nautilus, un indexeur ou Cobblestone lui-même suffisaient à
 * l'amorcer.
 *
 * On ne garde donc que ce qui peut changer le résultat d'un scan : une écriture,
 * une création, une suppression ou un renommage, hors des dossiers que le scan
 * ignore de toute façon.
 */

/** Forme des évènements de `@tauri-apps/plugin-fs` (sérialisation `notify` v6). */
export interface WatchEventLike {
  type: unknown;
  paths: string[];
}

/** L'évènement peut-il modifier l'arborescence ou le contenu d'un document ? */
export function changesWorkspace(event: WatchEventLike, root: string): boolean {
  if (isReadOnlyAccess(event.type)) return false;

  // Sans chemin (rescan demandé par `notify`, évènement inconnu), on ne sait
  // pas ce qui a changé : mieux vaut un scan de trop qu'un arbre périmé.
  if (event.paths.length === 0) return true;
  return event.paths.some((path) => !isIgnoredPath(path, root));
}

/**
 * Ouverture, lecture ou fermeture sans écriture. `close` en mode `write` est
 * gardé : c'est la fin d'une écriture, parfois le seul évènement qu'elle laisse.
 */
function isReadOnlyAccess(type: unknown): boolean {
  if (typeof type !== 'object' || type === null || !('access' in type)) return false;
  const access = (type as { access: unknown }).access;
  if (typeof access !== 'object' || access === null) return true;
  const { kind, mode } = access as { kind?: unknown; mode?: unknown };
  return !(kind === 'close' && mode === 'write');
}

/**
 * Chemin que le scan (`TauriFileSystem.walk`) ne remonterait pas : sous un
 * dossier ignoré ou caché, ou lui-même dossier ignoré, ou fichier caché qui
 * n'est pas un document (fichier d'échange d'un éditeur, par exemple).
 */
function isIgnoredPath(path: string, root: string): boolean {
  const relative = relativeTo(path, root);
  if (!relative) return false;

  const segments = relative.split('/');
  const name = segments.pop() ?? '';
  if (segments.some((segment) => IGNORED_DIRECTORIES.has(segment) || segment.startsWith('.'))) {
    return true;
  }
  return IGNORED_DIRECTORIES.has(name) || (name.startsWith('.') && !isWorkspaceFile(name));
}

/** Chemin relatif à la racine, `null` s'il n'est pas dessous. */
function relativeTo(path: string, root: string): string | null {
  const normalizedRoot = toPosix(root);
  const normalizedPath = toPosix(path);
  if (normalizedPath === normalizedRoot) return '';
  const prefix = `${normalizedRoot}/`;
  return normalizedPath.startsWith(prefix) ? normalizedPath.slice(prefix.length) : null;
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}
