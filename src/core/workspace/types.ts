/**
 * Types fondamentaux du domaine Cobblestone.
 *
 * Ce module — comme tout `core/` — est du TypeScript pur : aucune dépendance à
 * Tauri, à React ou au DOM. C'est ce qui permet de le tester sans lancer l'app.
 */

/** Le mode `server` est déclaré mais pas encore implémenté (voir PLAN.md, phase 3). */
export type WorkspaceType = 'local' | 'server';

export type WorkspaceStatus = 'loading' | 'ready' | 'unavailable';

export interface WorkspaceDescriptor {
  id: string;
  /** Nom affiché, et préfixe utilisé dans les liens cross-workspace : `[[Nom:page]]`. */
  name: string;
  type: WorkspaceType;
  /** Chemin absolu pour un workspace `local`, URL de base pour un workspace `server`. */
  location: string;
  /** Teinte de l'onglet, purement cosmétique. */
  color?: string;
}

export interface Workspace extends WorkspaceDescriptor {
  status: WorkspaceStatus;
  /** Renseigné quand `status === 'unavailable'` : dossier déplacé, permission perdue… */
  error?: string;
  /** Racine du dépôt Git contenant le workspace, si détectée. */
  gitRoot?: string;
}

/** Une entrée de l'arborescence de fichiers d'un workspace. */
export interface FileEntry {
  /** Nom du fichier ou dossier, sans le chemin. */
  name: string;
  /** Chemin relatif à la racine du workspace, séparateurs POSIX. */
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
}

/** Un lien `[[wiki-link]]` tel qu'écrit dans la source, avant résolution. */
export interface WikiLink {
  /** Texte complet du lien, crochets compris : `[[Wiki:process:onboarding|Onboarding]]`. */
  raw: string;
  /** Préfixe avant le premier `:`, candidat au nom de workspace. */
  workspaceHint?: string;
  /** Cible sans le préfixe de workspace, séparateurs normalisés en `/`. */
  target: string;
  /** Libellé après le `|`, s'il existe. */
  label?: string;
  /** Position du lien dans la source, en caractères. */
  offset: number;
}

/** Un lien résolu vers une note existante — ou signalé comme cassé. */
export interface ResolvedLink {
  link: WikiLink;
  /** Identifiant de la note cible, `null` si aucune note ne correspond. */
  targetId: string | null;
  targetWorkspaceId: string | null;
  targetSlug: string;
}

/** Une note indexée : le fichier MDX parsé, prêt à être lié et cherché. */
export interface Note {
  /** `${workspaceId}::${slug}` — unique dans toute l'application. */
  id: string;
  workspaceId: string;
  /** Chemin relatif au workspace, avec extension : `process/onboarding.mdx`. */
  path: string;
  /** Chemin relatif sans extension : `process/onboarding`. C'est la cible des wiki-links. */
  slug: string;
  /** `frontmatter.title`, sinon premier titre H1, sinon nom du fichier. */
  title: string;
  frontmatter: Record<string, unknown>;
  /** Corps du document, frontmatter exclu. */
  content: string;
  links: WikiLink[];
  /** Date de dernière modification sur disque, en millisecondes. */
  updatedAt?: number;
}

/** Référence légère vers une note, utilisée pour la navigation. */
export interface NoteRef {
  workspaceId: string;
  path: string;
}

export function noteId(workspaceId: string, slug: string): string {
  return `${workspaceId}::${slug}`;
}
