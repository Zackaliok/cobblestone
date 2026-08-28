import { Command } from '@tauri-apps/plugin-shell';

/**
 * Historique Git en **lecture seule** pour les workspaces locaux.
 *
 * Cobblestone n'écrit jamais dans le dépôt d'un workspace local : ni `add`, ni
 * `commit`, ni `push`, ni création de branche. Le développeur garde la main
 * complète sur son historique. Ce module se contente d'appeler `git log`.
 *
 * Les commandes sont déclarées une à une dans `src-tauri/capabilities/default.json`
 * avec leurs arguments figés ; seul le chemin est variable, et il est validé par
 * une regex côté Rust. Le frontend ne peut donc pas exécuter autre chose.
 */

export interface Commit {
  hash: string;
  shortHash: string;
  author: string;
  /** Date ISO 8601. */
  date: string;
  subject: string;
}

/** Séparateur d'unité — `%x1f` dans le format git, absent de tout message. */
const FIELD_SEPARATOR = '\u001f';

/**
 * Remonte à la racine du dépôt contenant `path`.
 *
 * Indispensable pour un monorepo : le workspace est souvent un sous-dossier
 * (`packages/api/docs`) et le `.git` se trouve plusieurs niveaux au-dessus.
 * Renvoie `null` si le chemin n'est pas dans un dépôt, ou si `git` est absent.
 */
export async function findGitRoot(path: string): Promise<string | null> {
  try {
    const result = await Command.create('git-root', [
      '-C',
      path,
      'rev-parse',
      '--show-toplevel',
    ]).execute();

    if (result.code !== 0) return null;
    const root = result.stdout.trim();
    return root ? root : null;
  } catch {
    // `git` absent du PATH, ou commande refusée par les capabilities.
    return null;
  }
}

export async function gitLog(
  repositoryPath: string,
  absoluteFilePath: string,
  limit = 50,
): Promise<Commit[]> {
  const result = await Command.create('git-log', [
    '-C',
    repositoryPath,
    'log',
    '--follow',
    `--format=%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s`,
    '-n',
    String(limit),
    '--',
    absoluteFilePath,
  ]).execute();

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'git log a échoué');
  }

  return parseGitLog(result.stdout);
}

/** Exporté pour les tests : le parsing ne dépend pas de Tauri. */
export function parseGitLog(stdout: string): Commit[] {
  const commits: Commit[] = [];

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const [hash, author, date, ...rest] = line.split(FIELD_SEPARATOR);
    if (!hash || !author || !date) continue;

    commits.push({
      hash,
      shortHash: hash.slice(0, 7),
      author,
      date,
      // Un sujet contenant le séparateur est impossible, mais rejoindre le
      // reste coûte moins cher que de tronquer silencieusement.
      subject: rest.join(FIELD_SEPARATOR),
    });
  }

  return commits;
}
