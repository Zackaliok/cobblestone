import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

import { activeEmojiQuery, type EmojiEntry } from '../../core/emoji/emoji';
import { rememberEmoji, useEmojiSuggestions } from '../emoji';
import { EmojiMenu } from './EmojiMenu';

interface CaretContext {
  query: string;
  /** Position du `:` déclencheur, à l'écran, pour placer le menu à côté. */
  left: number;
  top: number;
  bottom: number;
}

/**
 * Menu d'émojis pour les zones `contenteditable` du WYSIWYG : il s'ouvre quand
 * on tape `:` en début de mot, se filtre avec la suite (`:roc` → 🚀), et
 * remplace la saisie par l'émoji choisi.
 *
 * Les touches sont interceptées en phase de capture, avant qu'Editor.js ne
 * les reçoive : sinon Entrée créerait un nouveau bloc au lieu de valider.
 *
 * Entrée et Tab ne valident que si un nom a commencé à être tapé, ou si l'on a
 * navigué dans le menu. En français, « Remarque : » se termine par un `:`
 * précédé d'une espace ; un retour à la ligne juste après ne doit pas insérer
 * un émoji.
 */
export function EmojiAutocomplete({ surfaceRef }: { surfaceRef: RefObject<HTMLElement> }) {
  const [context, setContext] = useState<CaretContext | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const suggestions = useEmojiSuggestions(context?.query ?? null);

  const query = context?.query;
  useEffect(() => {
    setHighlighted(0);
    setNavigated(false);
  }, [query]);

  // Les écouteurs DOM sont posés une fois : ils lisent l'état courant ici.
  const latest = useRef({ context, suggestions, highlighted, navigated });
  latest.current = { context, suggestions, highlighted, navigated };
  /** Sélection d'un émoji, définie avec les écouteurs ; utilisée aussi au clic. */
  const pickRef = useRef<(entry: EmojiEntry) => void>(() => {});

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const refresh = () => setContext(readCaretContext(surface));
    const close = () => setContext(null);

    const pick = (entry: EmojiEntry) => {
      const current = latest.current.context;
      if (current) insertEmoji(current.query, entry.emoji);
      rememberEmoji(entry.emoji);
      setContext(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const { context: open, suggestions: items, highlighted: index, navigated: moved } =
        latest.current;
      if (!open || items.length === 0) return;

      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        consume();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setHighlighted((index + step + items.length) % items.length);
        setNavigated(true);
      } else if ((event.key === 'Enter' || event.key === 'Tab') && (open.query || moved)) {
        consume();
        pick(items[index]!);
      } else if (event.key === 'Escape') {
        consume();
        close();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      // Déplacer le curseur peut faire entrer ou sortir d'un `:mot`.
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) refresh();
    };

    pickRef.current = pick;
    surface.addEventListener('keydown', onKeyDown, true);
    surface.addEventListener('keyup', onKeyUp);
    surface.addEventListener('input', refresh);
    surface.addEventListener('click', refresh);
    surface.addEventListener('focusout', close);
    return () => {
      surface.removeEventListener('keydown', onKeyDown, true);
      surface.removeEventListener('keyup', onKeyUp);
      surface.removeEventListener('input', refresh);
      surface.removeEventListener('click', refresh);
      surface.removeEventListener('focusout', close);
    };
  }, [surfaceRef]);

  if (!context || suggestions.length === 0) return null;

  return (
    <EmojiMenu
      suggestions={suggestions}
      highlighted={highlighted}
      onPick={(entry) => pickRef.current(entry)}
      style={menuPosition(context)}
    />
  );
}

/** Taille maximale du menu (voir `.emoji-menu` / `.suggestions`), pour qu'il reste dans la fenêtre. */
const MENU_WIDTH = 320;
const MENU_HEIGHT = 220;

/** Sous le `:`, ou au-dessus s'il n'y a pas la place ; jamais hors de la fenêtre à droite. */
function menuPosition({ left, top, bottom }: CaretContext): CSSProperties {
  const below = bottom + 4 + MENU_HEIGHT <= window.innerHeight;
  return {
    position: 'fixed',
    left: Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8)),
    right: 'auto',
    ...(below
      ? { top: bottom + 4, bottom: 'auto' }
      : { top: 'auto', bottom: window.innerHeight - top + 4 }),
  };
}

/** Saisie `:…` juste avant le curseur, si le curseur est dans du texte éditable. */
function readCaretContext(surface: HTMLElement): CaretContext | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;

  const node = selection.anchorNode;
  if (!(node instanceof Text) || !surface.contains(node)) return null;
  if (!node.parentElement?.isContentEditable) return null;

  const offset = selection.anchorOffset;
  const query = activeEmojiQuery(node.data.slice(0, offset));
  if (query === null) return null;

  // Le rectangle du `:` lui-même : un curseur en fin de ligne n'en a parfois pas.
  const range = document.createRange();
  const start = offset - query.length - 1;
  range.setStart(node, start);
  range.setEnd(node, start + 1);
  const rect = range.getBoundingClientRect();

  return { query, left: rect.left, top: rect.top, bottom: rect.bottom };
}

/** Remplace `:saisie` (juste avant le curseur) par l'émoji. */
function insertEmoji(query: string, emoji: string): void {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!selection || !(node instanceof Text)) return;

  const offset = selection.anchorOffset;
  const range = document.createRange();
  range.setStart(node, offset - query.length - 1);
  range.setEnd(node, offset);
  selection.removeAllRanges();
  selection.addRange(range);

  // `insertText` passe par l'historique d'annulation et déclenche les
  // événements qu'Editor.js observe pour synchroniser le document.
  document.execCommand('insertText', false, emoji);
}
