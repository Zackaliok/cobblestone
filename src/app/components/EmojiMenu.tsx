import type { CSSProperties } from 'react';

import type { EmojiEntry } from '../../core/emoji/emoji';

/** Liste de suggestions d'émojis, partagée par les deux éditeurs. */
export function EmojiMenu({
  suggestions,
  highlighted,
  onPick,
  style,
}: {
  suggestions: EmojiEntry[];
  highlighted: number;
  onPick: (entry: EmojiEntry) => void;
  style?: CSSProperties;
}) {
  return (
    <ul className="suggestions emoji-menu" role="listbox" aria-label="Émojis" style={style}>
      {suggestions.map((entry, index) => (
        <li key={entry.emoji}>
          <button
            type="button"
            role="option"
            aria-selected={index === highlighted}
            className={index === highlighted ? 'suggestions__item is-active' : 'suggestions__item'}
            // `mousedown` plutôt que `click` : le clic ferait perdre le focus à
            // l'éditeur, et avec lui la position du curseur où insérer.
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(entry);
            }}
          >
            <span className="emoji-menu__glyph">{entry.emoji}</span>
            <span className="emoji-menu__name">:{entry.names[0]}:</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
