import type { FileEntry } from '../workspace/types';
import {
  FileSystemError,
  type FileSystem,
  isDocumentFile,
  normalizeRelativePath,
  sortEntries,
} from './FileSystem';

/**
 * Implémentation en mémoire du `FileSystem`.
 *
 * Sert à deux choses : tester le core sans lancer Tauri, et faire tourner
 * l'application dans un navigateur (`npm run dev` seul) avec un workspace de
 * démonstration, quand la toolchain Rust n'est pas disponible.
 */
export class MemoryFileSystem implements FileSystem {
  readonly root: string;
  private files = new Map<string, { content: string; modifiedAt: number }>();
  private listeners = new Set<() => void>();

  constructor(root = 'memory://workspace', initial: Record<string, string> = {}) {
    this.root = root;
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(normalizeRelativePath(path), { content, modifiedAt: Date.now() });
    }
  }

  async list(): Promise<FileEntry[]> {
    // On reconstruit l'arborescence à partir de la liste plate des chemins.
    const rootEntries: FileEntry[] = [];
    const directories = new Map<string, FileEntry>();

    const ensureDirectory = (path: string): FileEntry[] => {
      if (!path) return rootEntries;

      const existing = directories.get(path);
      if (existing) return existing.children!;

      const separator = path.lastIndexOf('/');
      const parentPath = separator === -1 ? '' : path.slice(0, separator);
      const name = path.slice(separator + 1);
      const siblings = ensureDirectory(parentPath);

      const directory: FileEntry = { name, path, isDirectory: true, children: [] };
      directories.set(path, directory);
      siblings.push(directory);
      return directory.children!;
    };

    for (const path of [...this.files.keys()].sort()) {
      const separator = path.lastIndexOf('/');
      const parentPath = separator === -1 ? '' : path.slice(0, separator);
      const name = path.slice(separator + 1);
      if (!isDocumentFile(name)) continue;
      ensureDirectory(parentPath).push({ name, path, isDirectory: false });
    }

    const sortDeep = (entries: FileEntry[]): FileEntry[] =>
      sortEntries(entries).map((entry) =>
        entry.children ? { ...entry, children: sortDeep(entry.children) } : entry,
      );

    return sortDeep(rootEntries);
  }

  async read(path: string): Promise<string> {
    const file = this.files.get(normalizeRelativePath(path));
    if (!file) throw new FileSystemError('Fichier introuvable', path);
    return file.content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(normalizeRelativePath(path), { content, modifiedAt: Date.now() });
    this.notify();
  }

  async remove(path: string): Promise<void> {
    const normalized = normalizeRelativePath(path);
    const prefix = `${normalized}/`;
    for (const key of [...this.files.keys()]) {
      if (key === normalized || key.startsWith(prefix)) this.files.delete(key);
    }
    this.notify();
  }

  async rename(from: string, to: string): Promise<void> {
    const source = normalizeRelativePath(from);
    const file = this.files.get(source);
    if (!file) throw new FileSystemError('Fichier introuvable', from);
    this.files.delete(source);
    this.files.set(normalizeRelativePath(to), file);
    this.notify();
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizeRelativePath(path);
    if (this.files.has(normalized)) return true;
    const prefix = `${normalized}/`;
    return [...this.files.keys()].some((key) => key.startsWith(prefix));
  }

  async mkdir(): Promise<void> {
    // Sans dossiers réels, un dossier vide n'a pas d'existence propre.
  }

  async modifiedAt(path: string): Promise<number | undefined> {
    return this.files.get(normalizeRelativePath(path))?.modifiedAt;
  }

  async watch(onChange: () => void): Promise<() => void> {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
