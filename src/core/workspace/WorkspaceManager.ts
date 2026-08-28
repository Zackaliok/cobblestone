import {
  flattenFiles,
  normalizeRelativePath,
  type FileSystem,
} from '../filesystem/FileSystem';
import { parseNote, serializeDocument } from '../parser/MDXParser';
import type { FileEntry, Note, Workspace } from './types';

/**
 * Plafond de notes indexées par workspace. Un monorepo peut contenir des
 * milliers de `.md` ; au-delà, l'indexation en mémoire pénalise le démarrage
 * pour un bénéfice nul. La troncature est signalée, jamais silencieuse.
 */
export const MAX_INDEXED_NOTES = 5000;

export interface ScanResult {
  tree: FileEntry[];
  notes: Note[];
  /** `true` si le plafond a été atteint et l'index est incomplet. */
  truncated: boolean;
  /** Fichiers illisibles, avec la raison. Le scan continue malgré eux. */
  failures: Array<{ path: string; reason: string }>;
}

/**
 * Registre des workspaces ouverts et de leur système de fichiers.
 *
 * Volontairement sans état React : le store Zustand s'appuie dessus, mais le
 * manager reste utilisable et testable seul, avec un `MemoryFileSystem`.
 */
export class WorkspaceManager {
  private filesystems = new Map<string, FileSystem>();

  attach(workspaceId: string, fileSystem: FileSystem): void {
    this.filesystems.set(workspaceId, fileSystem);
  }

  detach(workspaceId: string): void {
    this.filesystems.delete(workspaceId);
  }

  has(workspaceId: string): boolean {
    return this.filesystems.has(workspaceId);
  }

  fileSystem(workspaceId: string): FileSystem {
    const fileSystem = this.filesystems.get(workspaceId);
    if (!fileSystem) {
      throw new Error(`Aucun système de fichiers attaché au workspace ${workspaceId}`);
    }
    return fileSystem;
  }

  /** Parcourt le workspace et parse chaque document en `Note`. */
  async scan(workspaceId: string): Promise<ScanResult> {
    const fileSystem = this.fileSystem(workspaceId);
    const tree = await fileSystem.list();
    const files = flattenFiles(tree);

    const notes: Note[] = [];
    const failures: ScanResult['failures'] = [];
    const truncated = files.length > MAX_INDEXED_NOTES;

    for (const file of files.slice(0, MAX_INDEXED_NOTES)) {
      try {
        const raw = await fileSystem.read(file.path);
        const modifiedAt = await fileSystem.modifiedAt(file.path);
        notes.push(parseNote(workspaceId, file.path, raw, modifiedAt));
      } catch (error) {
        // Un fichier illisible (binaire mal nommé, permission) ne doit pas
        // faire échouer l'indexation de tout le workspace.
        failures.push({
          path: file.path,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { tree, notes, truncated, failures };
  }

  async readRaw(workspaceId: string, path: string): Promise<string> {
    return this.fileSystem(workspaceId).read(path);
  }

  async saveNote(workspaceId: string, path: string, raw: string): Promise<Note> {
    const fileSystem = this.fileSystem(workspaceId);
    await fileSystem.write(path, raw);
    const modifiedAt = await fileSystem.modifiedAt(path);
    return parseNote(workspaceId, path, raw, modifiedAt);
  }

  /**
   * Crée un document. Échoue si le fichier existe déjà : écraser une note
   * parce que deux titres se ressemblent serait une perte de données.
   */
  async createNote(workspaceId: string, path: string, title?: string): Promise<Note> {
    const fileSystem = this.fileSystem(workspaceId);
    const normalized = ensureExtension(normalizeRelativePath(path));

    if (await fileSystem.exists(normalized)) {
      throw new Error(`Le fichier ${normalized} existe déjà`);
    }

    const heading = title ?? normalized.slice(normalized.lastIndexOf('/') + 1).replace(/\.mdx?$/i, '');
    const raw = serializeDocument(
      { title: heading, created: new Date().toISOString().slice(0, 10) },
      `# ${heading}\n\n`,
    );

    return this.saveNote(workspaceId, normalized, raw);
  }

  async deleteNote(workspaceId: string, path: string): Promise<void> {
    await this.fileSystem(workspaceId).remove(path);
  }

  async renameNote(workspaceId: string, from: string, to: string): Promise<string> {
    const target = ensureExtension(normalizeRelativePath(to));
    const fileSystem = this.fileSystem(workspaceId);

    if (await fileSystem.exists(target)) {
      throw new Error(`Le fichier ${target} existe déjà`);
    }

    await fileSystem.rename(from, target);
    return target;
  }

  /** Vérifie qu'un workspace est toujours accessible (dossier déplacé, scope perdu). */
  async isAvailable(workspaceId: string): Promise<boolean> {
    try {
      await this.fileSystem(workspaceId).list();
      return true;
    } catch {
      return false;
    }
  }

  async watch(workspaceId: string, onChange: () => void): Promise<(() => void) | null> {
    const fileSystem = this.fileSystem(workspaceId);
    if (!fileSystem.watch) return null;
    return fileSystem.watch(onChange);
  }
}

function ensureExtension(path: string): string {
  return /\.mdx?$/i.test(path) ? path : `${path}.mdx`;
}

/**
 * Garantit l'unicité du nom d'un workspace.
 *
 * Le nom n'est pas décoratif : c'est le préfixe des liens cross-workspace
 * (`[[Wiki:page]]`). Deux workspaces homonymes rendraient ces liens ambigus.
 */
export function uniqueWorkspaceName(desired: string, existing: Workspace[]): string {
  const taken = new Set(existing.map((workspace) => workspace.name.toLowerCase()));
  const base = desired.trim() || 'Workspace';

  if (!taken.has(base.toLowerCase())) return base;

  let suffix = 2;
  while (taken.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

/** Dérive un nom lisible depuis un chemin absolu. */
export function workspaceNameFromPath(path: string): string {
  const segments = path.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  return segments[segments.length - 1] || path;
}
