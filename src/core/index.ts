/** Point d'entrée du moteur Cobblestone — TypeScript pur, sans dépendance UI. */

export * from './workspace/types';
export * from './workspace/WorkspaceManager';

export * from './filesystem/FileSystem';
export { TauriFileSystem } from './filesystem/TauriFileSystem';
export { MemoryFileSystem } from './filesystem/MemoryFileSystem';

export * from './parser/types';
export * from './parser/MDXParser';
export * from './parser/MDXEditorConverter';

export * from './graph/types';
export * from './graph/KnowledgeGraph';

export * from './search/searchNotes';

export { findGitRoot, gitLog, parseGitLog, type Commit } from './git/LocalGitLog';
