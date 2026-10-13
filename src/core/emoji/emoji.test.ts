import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import {
  activeEmojiQuery,
  buildShortcodeIndex,
  pushRecentEmoji,
  remarkEmojiShortcodes,
  replaceShortcodes,
  searchEmojis,
  type EmojiEntry,
} from './emoji';

const ENTRIES: EmojiEntry[] = [
  { emoji: '😀', names: ['grinning'], tags: ['smile', 'happy'] },
  { emoji: '😄', names: ['smile'], tags: ['happy', 'joy'] },
  { emoji: '😸', names: ['smile_cat'], tags: [] },
  { emoji: '🚀', names: ['rocket'], tags: ['ship', 'launch'] },
  { emoji: '👍', names: ['+1', 'thumbsup'], tags: ['approve', 'ok'] },
  { emoji: '✅', names: ['white_check_mark'], tags: [] },
];

describe('activeEmojiQuery', () => {
  it('se déclenche sur un `:` qui ouvre un mot', () => {
    expect(activeEmojiQuery(':')).toBe('');
    expect(activeEmojiQuery('Bravo :roc')).toBe('roc');
    expect(activeEmojiQuery('(:+1')).toBe('+1');
    expect(activeEmojiQuery('Remarque :')).toBe('');
  });

  it('ignore les heures, les URL et les noms terminés', () => {
    expect(activeEmojiQuery('à 10:30')).toBeNull();
    expect(activeEmojiQuery('https:')).toBeNull();
    expect(activeEmojiQuery(':rocket: ')).toBeNull();
    expect(activeEmojiQuery('Remarque : texte')).toBeNull();
  });
});

describe('searchEmojis', () => {
  it('classe le nom exact, puis les débuts, puis les contenus, puis les mots-clés', () => {
    expect(searchEmojis(ENTRIES, 'smile').map((entry) => entry.emoji)).toEqual(['😄', '😸', '😀']);
  });

  it('remonte un récent à pertinence égale', () => {
    const result = searchEmojis(ENTRIES, 'smile_', { recents: ['😸'] });
    expect(result[0]!.emoji).toBe('😸');
  });

  it('propose les récents puis la sélection par défaut sans saisie', () => {
    const result = searchEmojis(ENTRIES, '', { recents: ['🚀'], limit: 3 });
    expect(result.map((entry) => entry.emoji)).toEqual(['🚀', '👍', '✅']);
  });
});

describe('récents', () => {
  it('place le dernier en tête, sans doublon, avec une limite', () => {
    expect(pushRecentEmoji(['🚀', '👍'], '👍')).toEqual(['👍', '🚀']);
    const full = Array.from({ length: 16 }, (_, index) => String(index));
    expect(pushRecentEmoji(full, 'x')).toHaveLength(16);
  });
});

describe('noms courts', () => {
  const index = buildShortcodeIndex(ENTRIES);

  it('remplace les noms connus seulement', () => {
    expect(replaceShortcodes('Go :rocket: :inconnu: :+1:', index)).toBe('Go 🚀 :inconnu: 👍');
  });

  it('ne touche pas au code dans le rendu', async () => {
    const js = String(
      await compile('Go :rocket: et `:rocket:`', { remarkPlugins: [remarkEmojiShortcodes(index)] }),
    );
    expect(js).toContain('Go 🚀 et ');
    expect(js).toContain('":rocket:"');
  });
});
