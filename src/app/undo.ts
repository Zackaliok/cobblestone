/**
 * Annuler / rétablir au clavier.
 *
 * WebView2 (Windows) traite seul Ctrl+Z, Ctrl+Y et Ctrl+Maj+Z dans les champs
 * de saisie. WebKitGTK (Linux) tient bien l'historique d'annulation de la page,
 * mais n'associe aucun raccourci à ses commandes `Undo` / `Redo` : il laisse ce
 * soin à l'application hôte, comme Epiphany le fait avec ses propres
 * accélérateurs. Sous Linux, l'application relaie donc ces raccourcis vers
 * `document.execCommand`, qui pilote ce même historique natif — celui de la
 * zone source comme celui des blocs du WYSIWYG.
 */

export type UndoAction = 'undo' | 'redo';

/** Ctrl+Z annule ; Ctrl+Y (usage Windows) et Ctrl+Maj+Z (usage GTK) rétablissent. */
export function undoShortcut(event: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
}): UndoAction | null {
  if (!event.ctrlKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}

/** Types d'`<input>` dont la valeur se tape au clavier. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

/**
 * Champ où l'on saisit du texte. L'historique de WebKitGTK est commun à toute
 * la page : ailleurs (case à cocher, bouton…), Ctrl+Z annulerait à l'aveugle
 * une modification faite dans un autre champ.
 */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly;
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(target.type) && !target.readOnly;
  }
  return false;
}
