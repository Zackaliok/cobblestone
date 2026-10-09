import { create } from 'zustand';

import type { FileSystem } from '../../core/filesystem/FileSystem';
import { isImageFile, pathToSlug } from '../../core/filesystem/FileSystem';
import { MemoryFileSystem } from '../../core/filesystem/MemoryFileSystem';
import { buildGraph } from '../../core/graph/KnowledgeGraph';
import type { Graph } from '../../core/graph/types';
import { resolveWikiLink } from '../../core/parser/MDXParser';
import {
  WorkspaceManager,
  uniqueWorkspaceName,
  workspaceNameFromPath,
} from '../../core/workspace/WorkspaceManager';
import type {
  FileEntry,
  Note,
  WikiLink,
  Workspace,
  WorkspaceDescriptor,
} from '../../core/workspace/types';
import { noteId } from '../../core/workspace/types';
import { DEMO_ALPHA_NOTES, DEMO_NOTES, loadDemoAlphaImages } from '../demo';
import {
  loadRecovery,
  loadSession,
  saveRecovery,
  saveSession,
  type RecoveredDraft,
} from '../persistence';
import { isDesktop } from '../platform';

export type EditorView = 'wysiwyg' | 'source' | 'preview' | 'graph' | 'history';
export type Scope = 'workspace' | 'global';

export interface OpenDocument {
  workspaceId: string;
  path: string;
}

export interface StatusMessage {
  text: string;
  tone: 'info' | 'error';
}

interface ScanIssues {
  truncated: boolean;
  failures: Array<{ path: string; reason: string }>;
}

interface DocState {
  ready: boolean;
  desktop: boolean;

  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  trees: Record<string, FileEntry[]>;
  notesByWorkspace: Record<string, Note[]>;
  issues: Record<string, ScanIssues>;
  graph: Graph;

  open: OpenDocument | null;
  /** Contenu brut en cours d'édition. */
  draft: string;
  /** Contenu tel qu'il est sur le disque, pour détecter les modifications. */
  persisted: string;
  /** Documents ouverts récemment, le plus récent en tête. */
  recents: OpenDocument[];
  /**
   * Image affichée seule, à la place de la vue courante. Le document ouvert et
   * son brouillon restent intacts derrière : revenir à une vue les retrouve.
   */
  openImage: OpenDocument | null;

  view: EditorView;
  graphScope: Scope;
  searchScope: Scope;
  searchQuery: string;
  status: StatusMessage | null;
  /** Brouillon retrouvé après une fermeture inattendue, en attente de décision. */
  recovery: RecoveredDraft | null;

  initialize(): Promise<void>;
  addLocalWorkspace(): Promise<void>;
  removeWorkspace(workspaceId: string): Promise<void>;
  setActiveWorkspace(workspaceId: string): void;
  refreshWorkspace(workspaceId: string): Promise<void>;

  openNote(workspaceId: string, path: string): Promise<void>;
  followLink(link: WikiLink, fromWorkspaceId: string): Promise<void>;
  openImageFile(workspaceId: string, path: string): void;
  closeImage(): void;
  restoreRecovery(): Promise<void>;
  dismissRecovery(): void;
  setDraft(draft: string): void;
  save(): Promise<void>;
  createNote(workspaceId: string, path: string): Promise<void>;
  deleteNote(workspaceId: string, path: string): Promise<void>;
  renameNote(workspaceId: string, from: string, to: string): Promise<void>;

  setView(view: EditorView): void;
  setGraphScope(scope: Scope): void;
  setSearchScope(scope: Scope): void;
  setSearchQuery(query: string): void;
  setStatus(status: StatusMessage | null): void;
}

const manager = new WorkspaceManager();
/** Arrêt des surveillances de fichiers, par workspace. */
const watchers = new Map<string, () => void>();
/** Scan en cours par workspace, et workspaces à rescanner une fois celui-ci terminé. */
const refreshRuns = new Map<string, Promise<void>>();
const refreshPending = new Set<string>();

export const useDocStore = create<DocState>()((set, get) => ({
  ready: false,
  desktop: isDesktop(),

  workspaces: [],
  activeWorkspaceId: null,
  trees: {},
  notesByWorkspace: {},
  issues: {},
  graph: { nodes: [], edges: [] },

  open: null,
  draft: '',
  persisted: '',
  recents: [],
  openImage: null,

  view: 'wysiwyg',
  graphScope: 'workspace',
  searchScope: 'workspace',
  searchQuery: '',
  status: null,
  recovery: null,

  async initialize() {
    if (!isDesktop()) {
      await loadDemoWorkspaces(set, get);
      set({ ready: true });
      return;
    }

    const session = await loadSession();
    const workspaces: Workspace[] = [];

    for (const descriptor of session.workspaces) {
      // Le chemin est mémorisé, l'autorisation d'accès ne l'est peut-être plus.
      // On revalide chaque workspace plutôt que de le supposer disponible.
      const workspace = await attachLocalWorkspace(descriptor);
      workspaces.push(workspace);
    }

    set({
      workspaces,
      activeWorkspaceId:
        session.activeWorkspaceId && workspaces.some((w) => w.id === session.activeWorkspaceId)
          ? session.activeWorkspaceId
          : (workspaces[0]?.id ?? null),
      ready: true,
    });

    // Ne proposer la restauration que si le workspace existe encore.
    const recovery = await loadRecovery();
    if (recovery && workspaces.some((w) => w.id === recovery.workspaceId)) set({ recovery });
    else if (recovery) await saveRecovery(null);

    for (const workspace of workspaces) {
      if (workspace.status === 'ready') await get().refreshWorkspace(workspace.id);
    }
  },

  async addLocalWorkspace() {
    if (!isDesktop()) {
      set({
        status: {
          text: "Ouvrir un dossier nécessite l'application desktop (npm run tauri dev).",
          tone: 'error',
        },
      });
      return;
    }

    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Choisir un dossier de documentation',
    });

    if (typeof selected !== 'string') return;

    const existing = get().workspaces;
    if (existing.some((workspace) => workspace.location === selected)) {
      set({ status: { text: 'Ce dossier est déjà ouvert.', tone: 'info' } });
      return;
    }

    const descriptor: WorkspaceDescriptor = {
      id: crypto.randomUUID(),
      name: uniqueWorkspaceName(workspaceNameFromPath(selected), existing),
      type: 'local',
      location: selected,
    };

    const workspace = await attachLocalWorkspace(descriptor);
    set({
      workspaces: [...existing, workspace],
      activeWorkspaceId: workspace.id,
    });

    await persist(get);
    if (workspace.status === 'ready') await get().refreshWorkspace(workspace.id);
  },

  async removeWorkspace(workspaceId) {
    refreshPending.delete(workspaceId);
    watchers.get(workspaceId)?.();
    watchers.delete(workspaceId);
    manager.detach(workspaceId);

    if (get().openImage?.workspaceId === workspaceId) set({ openImage: null });

    const workspaces = get().workspaces.filter((workspace) => workspace.id !== workspaceId);
    const { [workspaceId]: _tree, ...trees } = get().trees;
    const { [workspaceId]: _notes, ...notesByWorkspace } = get().notesByWorkspace;
    const { [workspaceId]: _issues, ...issues } = get().issues;

    const open = get().open?.workspaceId === workspaceId ? null : get().open;

    set({
      workspaces,
      trees,
      notesByWorkspace,
      issues,
      open,
      ...(open ? {} : { draft: '', persisted: '' }),
      activeWorkspaceId:
        get().activeWorkspaceId === workspaceId ? (workspaces[0]?.id ?? null) : get().activeWorkspaceId,
    });

    reindex(set, get);
    await persist(get);
  },

  setActiveWorkspace(workspaceId) {
    set({ activeWorkspaceId: workspaceId });
    void persist(get);
  },

  refreshWorkspace(workspaceId) {
    // Un seul scan à la fois par workspace. Le watcher peut émettre en rafale
    // (git, build, IDE) : lancer un scan complet par évènement empilerait des
    // parcours concurrents du disque. Les demandes arrivées pendant un scan se
    // fondent en un unique nouveau passage.
    const running = refreshRuns.get(workspaceId);
    if (running) {
      refreshPending.add(workspaceId);
      return running;
    }

    const run = (async () => {
      try {
        do {
          refreshPending.delete(workspaceId);
          await scanWorkspace(set, get, workspaceId);
        } while (refreshPending.has(workspaceId));
      } finally {
        refreshRuns.delete(workspaceId);
      }
    })();
    refreshRuns.set(workspaceId, run);
    return run;
  },

  async openNote(workspaceId, path) {
    try {
      const raw = await manager.readRaw(workspaceId, path);
      const entry: OpenDocument = { workspaceId, path };

      set((state) => ({
        open: entry,
        openImage: null,
        draft: raw,
        persisted: raw,
        activeWorkspaceId: workspaceId,
        status: null,
        recents: [
          entry,
          ...state.recents.filter(
            (candidate) =>
              candidate.workspaceId !== workspaceId || candidate.path !== path,
          ),
        ].slice(0, 12),
      }));
    } catch (error) {
      set({ status: { text: `Ouverture impossible : ${describeError(error)}`, tone: 'error' } });
    }
  },

  /**
   * Suit un wiki-link. Si la cible n'existe pas, on ne crée rien
   * automatiquement : on le signale. Créer des fichiers sur simple clic
   * remplirait vite le dépôt de pages vides accidentelles.
   */
  async followLink(link, fromWorkspaceId) {
    const state = get();
    const allNotes = Object.values(state.notesByWorkspace).flat();
    const existing = new Set(allNotes.map((note) => note.id));

    const resolved = resolveWikiLink(link, fromWorkspaceId, state.workspaces, (workspaceId, slug) =>
      existing.has(noteId(workspaceId, slug)),
    );

    if (!resolved.targetId) {
      set({
        status: {
          text: `« ${resolved.targetSlug} » n'existe pas encore dans ce workspace.`,
          tone: 'info',
        },
      });
      return;
    }

    const target = allNotes.find((note) => note.id === resolved.targetId);
    if (target) await get().openNote(target.workspaceId, target.path);
  },

  openImageFile(workspaceId, path) {
    set({ openImage: { workspaceId, path }, activeWorkspaceId: workspaceId, status: null });
  },

  closeImage() {
    set({ openImage: null });
  },

  async restoreRecovery() {
    const { recovery } = get();
    if (!recovery) return;

    await get().openNote(recovery.workspaceId, recovery.path);
    // `persisted` reste le contenu du disque : le document apparaît modifié
    // et rien n'est écrit tant que l'utilisateur n'enregistre pas.
    if (get().open?.path === recovery.path) {
      set({ draft: recovery.draft, recovery: null });
    }
  },

  dismissRecovery() {
    set({ recovery: null });
    void saveRecovery(null);
  },

  setDraft(draft) {
    set({ draft });
  },

  async save() {
    const { open, draft } = get();
    if (!open) return;

    try {
      const note = await manager.saveNote(open.workspaceId, open.path, draft);

      set((state) => {
        const notes = state.notesByWorkspace[open.workspaceId] ?? [];
        const index = notes.findIndex((candidate) => candidate.path === open.path);
        const updated =
          index === -1
            ? [...notes, note]
            : notes.map((candidate, position) => (position === index ? note : candidate));

        return {
          persisted: draft,
          notesByWorkspace: { ...state.notesByWorkspace, [open.workspaceId]: updated },
          status: { text: `${open.path} enregistré`, tone: 'info' as const },
        };
      });

      reindex(set, get);
    } catch (error) {
      set({ status: { text: `Enregistrement impossible : ${describeError(error)}`, tone: 'error' } });
    }
  },

  async createNote(workspaceId, path) {
    try {
      const note = await manager.createNote(workspaceId, path);
      await get().refreshWorkspace(workspaceId);
      await get().openNote(workspaceId, note.path);
      set({ view: 'wysiwyg' });
    } catch (error) {
      set({ status: { text: describeError(error), tone: 'error' } });
    }
  },

  async deleteNote(workspaceId, path) {
    try {
      await manager.deleteNote(workspaceId, path);
      const { open, openImage } = get();
      if (open?.workspaceId === workspaceId && open.path === path) {
        set({ open: null, draft: '', persisted: '' });
      }
      if (openImage?.workspaceId === workspaceId && openImage.path === path) {
        set({ openImage: null });
      }
      await get().refreshWorkspace(workspaceId);
      set({ status: { text: `${path} supprimé`, tone: 'info' } });
    } catch (error) {
      set({ status: { text: `Suppression impossible : ${describeError(error)}`, tone: 'error' } });
    }
  },

  async renameNote(workspaceId, from, to) {
    try {
      const target = await manager.renameNote(workspaceId, from, to);
      await get().refreshWorkspace(workspaceId);

      const { open, openImage } = get();
      if (open?.workspaceId === workspaceId && open.path === from) {
        await get().openNote(workspaceId, target);
      }
      if (openImage?.workspaceId === workspaceId && openImage.path === from) {
        set({ openImage: { workspaceId, path: target } });
      }

      // Les liens vers l'ancien nom ne sont pas réécrits : les wiki-links
      // apparaîtront comme cassés dans le graphe, ce qui les rend repérables.
      set({
        status: {
          text: isImageFile(from)
            ? `Renommé en ${target}. Les notes qui affichent « ${from} » ne la trouveront plus.`
            : `Renommé en ${target}. Les liens vers « ${pathToSlug(from)} » sont maintenant cassés.`,
          tone: 'info',
        },
      });
    } catch (error) {
      set({ status: { text: `Renommage impossible : ${describeError(error)}`, tone: 'error' } });
    }
  },

  setView(view) {
    set({ view, openImage: null });
  },
  setGraphScope(graphScope) {
    set({ graphScope });
  },
  setSearchScope(searchScope) {
    set({ searchScope });
  },
  setSearchQuery(searchQuery) {
    set({ searchQuery });
  },
  setStatus(status) {
    set({ status });
  },
}));

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

type SetState = (partial: Partial<DocState> | ((state: DocState) => Partial<DocState>)) => void;
type GetState = () => DocState;

/**
 * Attache un système de fichiers à un workspace et vérifie qu'il répond.
 *
 * Un workspace injoignable n'est jamais supprimé de la liste : il est marqué
 * `unavailable`. Le dossier peut être sur un disque externe débranché — le
 * retirer silencieusement ferait disparaître le travail de l'utilisateur.
 */
/** Scan complet d'un workspace ; voir `refreshWorkspace` pour la sérialisation. */
async function scanWorkspace(set: SetState, get: GetState, workspaceId: string): Promise<void> {
    if (!manager.has(workspaceId)) return;

    try {
      const result = await manager.scan(workspaceId);

      set((state) => ({
        trees: { ...state.trees, [workspaceId]: result.tree },
        notesByWorkspace: { ...state.notesByWorkspace, [workspaceId]: result.notes },
        issues: {
          ...state.issues,
          [workspaceId]: { truncated: result.truncated, failures: result.failures },
        },
        workspaces: state.workspaces.map((workspace) =>
          workspace.id === workspaceId ? { ...workspace, status: 'ready' as const } : workspace,
        ),
      }));

      reindex(set, get);
      await startWatching(workspaceId, get);
    } catch (error) {
      markUnavailable(set, workspaceId, describeError(error));
    }
  }

async function attachLocalWorkspace(descriptor: WorkspaceDescriptor): Promise<Workspace> {
  try {
    const { TauriFileSystem } = await import('../../core/filesystem/TauriFileSystem');
    const fileSystem: FileSystem = new TauriFileSystem(descriptor.location);
    manager.attach(descriptor.id, fileSystem);

    if (!(await manager.isAvailable(descriptor.id))) {
      return {
        ...descriptor,
        status: 'unavailable',
        error: "Dossier inaccessible (déplacé, débranché, ou autorisation perdue).",
      };
    }

    const gitRoot = await detectGitRoot(descriptor.location);
    return { ...descriptor, status: 'ready', ...(gitRoot ? { gitRoot } : {}) };
  } catch (error) {
    return { ...descriptor, status: 'unavailable', error: describeError(error) };
  }
}

async function detectGitRoot(path: string): Promise<string | null> {
  try {
    const { findGitRoot } = await import('../../core/git/LocalGitLog');
    return await findGitRoot(path);
  } catch {
    // `git` absent du PATH : l'onglet Historique sera simplement masqué.
    return null;
  }
}

async function loadDemoWorkspaces(set: SetState, get: GetState): Promise<void> {
  const notes: Workspace = {
    id: 'demo-notes',
    name: 'Notes',
    type: 'local',
    location: 'memory://notes',
    status: 'ready',
  };
  const alpha: Workspace = {
    id: 'demo-alpha',
    name: 'Projet Alpha',
    type: 'local',
    location: 'memory://alpha',
    status: 'ready',
  };

  manager.attach(notes.id, new MemoryFileSystem(notes.location, DEMO_NOTES));
  const alphaImages = await loadDemoAlphaImages().catch(() => ({}));
  manager.attach(
    alpha.id,
    new MemoryFileSystem(alpha.location, { ...DEMO_ALPHA_NOTES, ...alphaImages }),
  );

  set({
    workspaces: [notes, alpha],
    activeWorkspaceId: notes.id,
    status: {
      text: 'Mode démonstration (navigateur) : les workspaces sont en mémoire, rien n’est écrit sur le disque.',
      tone: 'info',
    },
  });

  await get().refreshWorkspace(notes.id);
  await get().refreshWorkspace(alpha.id);
  await get().openNote(notes.id, 'index.mdx');
}

function markUnavailable(set: SetState, workspaceId: string, error: string): void {
  set((state) => ({
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId
        ? { ...workspace, status: 'unavailable' as const, error }
        : workspace,
    ),
  }));
}

/** Recalcule le graphe global. Appelé après tout changement de l'index. */
function reindex(set: SetState, get: GetState): void {
  const state = get();
  const notes = Object.values(state.notesByWorkspace).flat();
  set({ graph: buildGraph(notes, state.workspaces) });
}

/**
 * Surveille le dossier pour se resynchroniser quand la doc est modifiée
 * ailleurs (IDE, `git checkout`…).
 *
 * Le rescan n'écrase jamais le brouillon en cours : seul l'index est
 * rafraîchi. Écraser l'éditeur pendant la frappe serait une perte de travail.
 */
async function startWatching(workspaceId: string, get: GetState): Promise<void> {
  if (watchers.has(workspaceId)) return;

  try {
    const stop = await manager.watch(workspaceId, () => {
      void get().refreshWorkspace(workspaceId);
    });
    if (stop) watchers.set(workspaceId, stop);
  } catch {
    // La surveillance est un confort : son échec ne doit rien casser.
  }
}

async function persist(get: GetState): Promise<void> {
  const state = get();
  if (!state.desktop) return;

  await saveSession({
    workspaces: state.workspaces.map(({ id, name, type, location, color }) => ({
      id,
      name,
      type,
      location,
      ...(color ? { color } : {}),
    })),
    activeWorkspaceId: state.activeWorkspaceId,
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export { manager as workspaceManager };
