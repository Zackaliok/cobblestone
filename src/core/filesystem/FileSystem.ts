import type { FileEntry } from '../workspace/types';

/**
 * Abstraction sur le stockage d'un workspace.
 *
 * Contrat commun à toutes les implémentations :
 *  - tous les chemins passés en argument sont **relatifs à la racine du workspace**
 *    et utilisent `/` comme séparateur, y compris sur Windows ;
 *  - aucun chemin ne doit sortir de la racine (`..` est rejeté) ;
 *  - les erreurs remontent sous forme de `FileSystemError`.
 */
export interface FileSystem {
  /** Racine du workspace : chemin absolu (local) ou URL de base (serveur). */
  readonly root: string;

  /** Arborescence complète, dossiers d'abord, triée par nom. */
  list(): Promise<FileEntry[]>;

  read(path: string): Promise<string>;

  /** Crée les dossiers parents manquants si nécessaire. */
  write(path: string, content: string): Promise<void>;

  remove(path: string): Promise<void>;

  rename(from: string, to: string): Promise<void>;

  exists(path: string): Promise<boolean>;

  mkdir(path: string): Promise<void>;

  /** Date de dernière modification en millisecondes, `undefined` si indisponible. */
  modifiedAt(path: string): Promise<number | undefined>;

  /**
   * Surveille la racine et notifie sur changement. Renvoie une fonction d'arrêt.
   * Optionnel : toutes les implémentations n'en sont pas capables.
   */
  watch?(onChange: () => void): Promise<() => void>;
}

export class FileSystemError extends Error {
  constructor(
    message: string,
    readonly path: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}

/** Dossiers ignorés au parcours : bruit inutile et coûteux dans un monorepo. */
export const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.venv',
  '__pycache__',
  'vendor',
]);

export const MDX_EXTENSIONS = ['.mdx', '.md'];

export function isDocumentFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MDX_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Normalise un chemin relatif et refuse toute évasion hors de la racine.
 *
 * C'est la seule barrière entre un chemin venant de l'UI (ou d'un wiki-link
 * malformé) et un appel filesystem réel : elle doit rester stricte.
 */
export function normalizeRelativePath(path: string): string {
  const cleaned = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments: string[] = [];

  for (const segment of cleaned.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) {
        throw new FileSystemError('Le chemin sort de la racine du workspace', path);
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.join('/');
}

/** Concatène des segments en chemin POSIX, en écartant les segments vides. */
export function joinPath(...segments: string[]): string {
  return segments
    .filter((segment) => segment.length > 0)
    .join('/')
    .replace(/\/{2,}/g, '/');
}

export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function basename(path: string, stripExtension = false): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (!stripExtension) return name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** `process/onboarding.mdx` -> `process/onboarding`. */
export function pathToSlug(path: string): string {
  const dir = dirname(path);
  const name = basename(path, true);
  return dir ? `${dir}/${name}` : name;
}

/** Tri stable de l'arborescence : dossiers d'abord, puis alphabétique. */
export function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' });
  });
}

/** Aplatit une arborescence en liste de fichiers (dossiers exclus). */
export function flattenFiles(entries: FileEntry[]): FileEntry[] {
  const files: FileEntry[] = [];
  const walk = (nodes: FileEntry[]) => {
    for (const node of nodes) {
      if (node.isDirectory) {
        if (node.children) walk(node.children);
      } else {
        files.push(node);
      }
    }
  };
  walk(entries);
  return files;
}
