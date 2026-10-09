/**
 * Émojis : recherche par nom court (`:rocket:`), récents, et remplacement des
 * noms courts dans le rendu.
 *
 * Les données viennent de `gemoji` — les noms courts de GitHub, ceux qu'on
 * retrouve dans la plupart des outils Markdown. Ce module les reçoit en
 * paramètre : il reste testable sans charger les ~1 900 entrées.
 */

export interface EmojiEntry {
  emoji: string;
  names: string[];
  tags: string[];
}

/** Proposés tant qu'aucun émoji n'a encore été utilisé. */
export const DEFAULT_EMOJIS = ['👍', '✅', '⚠️', '❌', '🚀', '💡', '📌', '🔥'];

export const MAX_RECENT_EMOJIS = 16;

/**
 * `:` suivi du début d'un nom, en fin de texte (juste avant le curseur).
 *
 * Le `:` doit ouvrir un mot : précédé d'un blanc, d'une parenthèse ou du début
 * de ligne. Sans cette règle, `10:30` ou `https:` ouvriraient le menu.
 */
const QUERY_BEFORE_CARET = /(?:^|[\s([{]):([a-z0-9_+-]*)$/i;

/** Texte saisi après le `:` déclencheur, ou `null` si le curseur n'en suit pas. */
export function activeEmojiQuery(textBeforeCaret: string): string | null {
  const match = QUERY_BEFORE_CARET.exec(textBeforeCaret);
  return match ? match[1]! : null;
}

/**
 * Suggestions pour une saisie. Sans saisie : les récents, complétés par une
 * sélection par défaut. Avec : les noms qui commencent par la saisie d'abord,
 * puis ceux qui la contiennent, puis les mots-clés.
 */
export function searchEmojis(
  entries: EmojiEntry[],
  query: string,
  { recents = [], limit = 8 }: { recents?: string[]; limit?: number } = {},
): EmojiEntry[] {
  const needle = query.toLowerCase();

  if (!needle) {
    const byEmoji = new Map(entries.map((entry) => [entry.emoji, entry]));
    const wanted = [...recents, ...DEFAULT_EMOJIS.filter((emoji) => !recents.includes(emoji))];
    return wanted
      .map((emoji) => byEmoji.get(emoji))
      .filter((entry): entry is EmojiEntry => entry !== undefined)
      .slice(0, limit);
  }

  const ranked: Array<{ entry: EmojiEntry; rank: number }> = [];
  for (const entry of entries) {
    let rank = Number.POSITIVE_INFINITY;
    for (const name of entry.names) {
      if (name === needle) rank = Math.min(rank, 0);
      else if (name.startsWith(needle)) rank = Math.min(rank, 1);
      else if (name.includes(needle)) rank = Math.min(rank, 2);
    }
    if (rank === Number.POSITIVE_INFINITY && entry.tags.some((tag) => tag.startsWith(needle))) {
      rank = 3;
    }
    if (rank !== Number.POSITIVE_INFINITY) {
      // Un émoji récent passe devant les autres à pertinence égale.
      ranked.push({ entry, rank: rank - (recents.includes(entry.emoji) ? 0.5 : 0) });
    }
  }

  // Le tri est stable : à rang égal, l'ordre de gemoji (par catégorie) est conservé.
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

/** Place un émoji en tête des récents. */
export function pushRecentEmoji(recents: string[], emoji: string): string[] {
  return [emoji, ...recents.filter((candidate) => candidate !== emoji)].slice(0, MAX_RECENT_EMOJIS);
}

// ---------------------------------------------------------------------------
// Noms courts dans le rendu : `:rocket:` -> 🚀
// ---------------------------------------------------------------------------

const SHORTCODE = /:([a-z0-9_+-]+):/gi;

export function buildShortcodeIndex(entries: EmojiEntry[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of entries) {
    for (const name of entry.names) index.set(name, entry.emoji);
  }
  return index;
}

/** Remplace les noms courts connus ; les autres (`:pas-un-emoji:`) restent tels quels. */
export function replaceShortcodes(text: string, index: Map<string, string>): string {
  return text.replace(SHORTCODE, (match, name: string) => index.get(name.toLowerCase()) ?? match);
}

interface TextTree {
  type: string;
  value?: string;
  children?: TextTree[];
}

/**
 * Plugin remark : remplace les noms courts dans le texte. Le code (inline ou
 * en bloc) n'est pas un nœud texte : `` `:rocket:` `` reste donc intact.
 */
export function remarkEmojiShortcodes(index: Map<string, string>) {
  return () => (tree: TextTree) => {
    const walk = (node: TextTree) => {
      if (node.type === 'text' && node.value) node.value = replaceShortcodes(node.value, index);
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
