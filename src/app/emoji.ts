import { useEffect, useMemo, useState } from 'react';

import { pushRecentEmoji, searchEmojis, type EmojiEntry } from '../core/emoji/emoji';

const RECENTS_KEY = 'cobblestone.recentEmojis';

let entriesPromise: Promise<EmojiEntry[]> | null = null;

/** ~1 900 émojis : chargés au premier `:` tapé, pas au démarrage. */
export function loadEmojis(): Promise<EmojiEntry[]> {
  entriesPromise ??= import('gemoji').then(({ gemoji }) => gemoji);
  return entriesPromise;
}

/** Les récents sont une commodité propre au poste : `localStorage` suffit. */
export function readRecentEmojis(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(pushRecentEmoji(readRecentEmojis(), emoji)));
  } catch {
    // Stockage indisponible : pas de récents, rien de plus.
  }
}

/** Suggestions pour la saisie courante ; `null` = menu fermé. */
export function useEmojiSuggestions(query: string | null): EmojiEntry[] {
  const [entries, setEntries] = useState<EmojiEntry[] | null>(null);

  useEffect(() => {
    if (query === null || entries) return;
    let cancelled = false;
    void loadEmojis().then((loaded) => {
      if (!cancelled) setEntries(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [query, entries]);

  return useMemo(() => {
    if (query === null || !entries) return [];
    return searchEmojis(entries, query, { recents: readRecentEmojis() });
  }, [query, entries]);
}
