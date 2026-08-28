import {
  exists as fsExists,
  mkdir as fsMkdir,
  readDir,
  readTextFile,
  remove as fsRemove,
  rename as fsRename,
  stat,
  watch,
  writeTextFile,
} from '@tauri-apps/plugin-fs';

import type { FileEntry } from '../workspace/types';
import {
  FileSystemError,
  IGNORED_DIRECTORIES,
  type FileSystem,
  dirname,
  isDocumentFile,
  joinPath,
  normalizeRelativePath,
  sortEntries,
} from './FileSystem';

/** Garde-fou contre les arborescences pathologiques d'un gros monorepo. */
const MAX_DEPTH = 12;

/**
 * Implémentation locale, adossée à `@tauri-apps/plugin-fs`.
 *
 * Remplace l'ancienne piste `LocalFileSystem` (File System Access API), qui
 * n'était supportée que par les navigateurs Chromium.
 *
 * Point important : la permission `fs:allow-*` déclarée dans les capabilities
 * autorise l'*opération*, jamais le *chemin*. Le chemin n'est accessible que
 * parce que l'utilisateur a choisi ce dossier via `plugin-dialog`, ce qui
 * accorde un scope au runtime — scope restauré au démarrage suivant par
 * `tauri-plugin-persisted-scope`. Instancier cette classe sur un chemin
 * arbitraire échouera donc, par construction.
 */
export class TauriFileSystem implements FileSystem {
  readonly root: string;

  constructor(root: string) {
    // On travaille en séparateurs POSIX partout ; Rust les accepte sous Windows.
    this.root = root.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  private absolute(path: string): string {
    const relative = normalizeRelativePath(path);
    return relative ? joinPath(this.root, relative) : this.root;
  }

  async list(): Promise<FileEntry[]> {
    try {
      return await this.walk('', 0);
    } catch (cause) {
      throw new FileSystemError(
        "Impossible de lire l'arborescence du workspace",
        this.root,
        cause,
      );
    }
  }

  /**
   * Parcours récursif avec élagage : un dossier qui ne contient aucun document
   * (directement ou en profondeur) n'est pas remonté. Sans ça, l'arbre d'un
   * monorepo serait noyé sous des dossiers de code vides de documentation.
   */
  private async walk(relative: string, depth: number): Promise<FileEntry[]> {
    if (depth > MAX_DEPTH) return [];

    const entries = await readDir(this.absolute(relative));
    const result: FileEntry[] = [];

    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;

      if (entry.isDirectory) {
        if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue;
        const children = await this.walk(path, depth + 1);
        if (children.length > 0) {
          result.push({ name: entry.name, path, isDirectory: true, children });
        }
        continue;
      }

      if (entry.isFile && isDocumentFile(entry.name)) {
        result.push({ name: entry.name, path, isDirectory: false });
      }
    }

    return sortEntries(result);
  }

  async read(path: string): Promise<string> {
    try {
      return await readTextFile(this.absolute(path));
    } catch (cause) {
      throw new FileSystemError('Lecture impossible', path, cause);
    }
  }

  async write(path: string, content: string): Promise<void> {
    try {
      const parent = dirname(normalizeRelativePath(path));
      if (parent) await this.mkdir(parent);
      await writeTextFile(this.absolute(path), content);
    } catch (cause) {
      throw new FileSystemError('Écriture impossible', path, cause);
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await fsRemove(this.absolute(path), { recursive: true });
    } catch (cause) {
      throw new FileSystemError('Suppression impossible', path, cause);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    try {
      const parent = dirname(normalizeRelativePath(to));
      if (parent) await this.mkdir(parent);
      await fsRename(this.absolute(from), this.absolute(to));
    } catch (cause) {
      throw new FileSystemError(`Renommage impossible vers ${to}`, from, cause);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      return await fsExists(this.absolute(path));
    } catch {
      // Un chemin hors scope lève plutôt que de renvoyer false : on traite les
      // deux cas de la même façon côté appelant.
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    try {
      await fsMkdir(this.absolute(path), { recursive: true });
    } catch (cause) {
      throw new FileSystemError('Création du dossier impossible', path, cause);
    }
  }

  async modifiedAt(path: string): Promise<number | undefined> {
    try {
      const info = await stat(this.absolute(path));
      return info.mtime ? info.mtime.getTime() : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Surveille la racine du workspace. Utile quand la doc est aussi éditée
   * depuis un IDE : l'arbre et le graph se resynchronisent tout seuls.
   *
   * Les évènements sont regroupés (`delayMs`) parce qu'une seule sauvegarde
   * d'éditeur en produit souvent plusieurs.
   */
  async watch(onChange: () => void): Promise<() => void> {
    const unwatch = await watch(this.root, () => onChange(), {
      recursive: true,
      delayMs: 400,
    });
    return () => {
      void unwatch();
    };
  }
}
