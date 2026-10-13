import { useEffect, useMemo, useRef, useState } from 'react';

import { activeEmojiQuery, type EmojiEntry } from '../../core/emoji/emoji';
import { rememberEmoji, useEmojiSuggestions } from '../emoji';
import { useAllNotes } from '../hooks/useWorkspace';
import { useDocStore } from '../store/DocStore';
import { EmptyState } from './Editor';
import { EmojiMenu } from './EmojiMenu';

const MAX_SUGGESTIONS = 8;

/**
 * Édition directe de la source MDX, frontmatter compris.
 *
 * Complète les `[[` avec les notes indexées. Les suggestions sont affichées
 * sous la zone de texte plutôt qu'au niveau du curseur : positionner un popup
 * sur le caret d'un `<textarea>` demande de dupliquer tout le rendu du texte
 * dans un calque miroir, pour un gain d'ergonomie faible.
 */
export function SourceEditor() {
  const open = useDocStore((state) => state.open);
  const draft = useDocStore((state) => state.draft);
  const setDraft = useDocStore((state) => state.setDraft);
  const workspaces = useDocStore((state) => state.workspaces);
  const notes = useAllNotes();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [highlighted, setHighlighted] = useState(0);

  /** Cibles proposables : `slug` dans le workspace courant, `Nom:slug` ailleurs. */
  const targets = useMemo(() => {
    if (!open) return [];
    return notes.map((note) => {
      if (note.workspaceId === open.workspaceId) return note.slug;
      const workspace = workspaces.find((candidate) => candidate.id === note.workspaceId);
      return workspace ? `${workspace.name}:${note.slug}` : note.slug;
    });
  }, [notes, workspaces, open]);

  const query = useMemo(() => activeLinkQuery(draft, caret), [draft, caret]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const needle = query.toLowerCase();
    return targets
      .filter((target) => target.toLowerCase().includes(needle))
      .slice(0, MAX_SUGGESTIONS);
  }, [query, targets]);

  // Émojis : `:roc` -> 🚀. Un wiki-link en cours d'écriture a la priorité.
  const emojiQuery = useMemo(
    () => (query === null && caret >= 0 ? activeEmojiQuery(draft.slice(0, caret)) : null),
    [query, draft, caret],
  );
  const emojis = useEmojiSuggestions(emojiQuery);
  const [navigated, setNavigated] = useState(false);

  useEffect(() => setHighlighted(0), [query]);
  useEffect(() => {
    setHighlighted(0);
    setNavigated(false);
  }, [emojiQuery]);

  if (!open) return <EmptyState />;

  const insert = (target: string) => {
    const textarea = textareaRef.current;
    if (!textarea || query === null) return;

    const start = caret - query.length;
    const closing = draft.slice(caret, caret + 2) === ']]' ? 2 : 0;
    const next = `${draft.slice(0, start)}${target}]]${draft.slice(caret + closing)}`;
    const position = start + target.length + 2;

    setDraft(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  const insertEmoji = (entry: EmojiEntry) => {
    const textarea = textareaRef.current;
    if (!textarea || emojiQuery === null) return;

    const start = caret - emojiQuery.length - 1;
    const next = `${draft.slice(0, start)}${entry.emoji}${draft.slice(caret)}`;
    const position = start + entry.emoji.length;

    rememberEmoji(entry.emoji);
    setDraft(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  const onEmojiKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((index) => (index + step + emojis.length) % emojis.length);
      setNavigated(true);
    } else if ((event.key === 'Enter' || event.key === 'Tab') && (emojiQuery || navigated)) {
      // Sans saisie après le `:` (« Remarque : » en fin de ligne), Entrée garde
      // son sens habituel, sauf si l'on a choisi dans le menu.
      const entry = emojis[highlighted];
      if (entry) {
        event.preventDefault();
        insertEmoji(entry);
      }
    } else if (event.key === 'Escape') {
      setCaret(-1);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (emojis.length > 0) {
      onEmojiKeyDown(event);
      return;
    }
    if (suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const target = suggestions[highlighted];
      if (target) {
        event.preventDefault();
        insert(target);
      }
    } else if (event.key === 'Escape') {
      setCaret(-1);
    }
  };

  const syncCaret = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCaret(event.currentTarget.selectionStart);
  };

  return (
    <div className="source-editor">
      <textarea
        ref={textareaRef}
        className="source-editor__input"
        value={draft}
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value);
          setCaret(event.target.selectionStart);
        }}
        // Échap ferme les suggestions en invalidant le curseur : le relire au
        // relâchement de la touche les rouvrirait aussitôt.
        onKeyUp={(event) => {
          if (event.key !== 'Escape') syncCaret(event);
        }}
        onClick={syncCaret}
        onKeyDown={onKeyDown}
        placeholder="# Titre&#10;&#10;Votre contenu MDX…"
      />

      {emojis.length > 0 && (
        <EmojiMenu suggestions={emojis} highlighted={highlighted} onPick={insertEmoji} />
      )}

      {suggestions.length > 0 && (
        <ul className="suggestions" role="listbox" aria-label="Cibles de wiki-link">
          {suggestions.map((target, index) => (
            <li key={target}>
              <button
                type="button"
                className={index === highlighted ? 'suggestions__item is-active' : 'suggestions__item'}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insert(target);
                }}
              >
                {target}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Renvoie le texte saisi depuis le dernier `[[` non fermé avant le curseur,
 * ou `null` si le curseur n'est pas dans un wiki-link en cours d'écriture.
 */
export function activeLinkQuery(text: string, caret: number): string | null {
  if (caret < 0) return null;

  const opening = text.lastIndexOf('[[', caret);
  if (opening === -1) return null;

  const between = text.slice(opening + 2, caret);
  if (between.includes(']]') || between.includes('\n')) return null;

  return between;
}
