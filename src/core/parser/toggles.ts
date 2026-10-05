/**
 * Composant `<Toggle>` : une case à cocher persistée dans le fichier.
 *
 * L'état est porté par l'attribut booléen `defaultOn`. Cocher la case — dans
 * l'aperçu comme dans le WYSIWYG — réécrit cet attribut dans la source, et
 * rien d'autre : le reste de la balise est laissé tel quel.
 */

import { buildCodeMask } from './MDXParser';

export interface ToggleData {
  label: string;
  checked: boolean;
}

export const DEFAULT_TOGGLE_LABEL = 'Option';

/**
 * Forme canonique, la seule que le WYSIWYG transforme en case à cocher : une
 * balise auto-fermante seule sur sa ligne, exactement telle que
 * `serializeToggle` l'écrit. Toute autre forme (attributs supplémentaires,
 * `defaultOn={…}`, espacement différent) reste en MDX brut : la réécrire en
 * forme canonique modifierait le fichier sans que l'utilisateur ait rien touché.
 */
const CANONICAL_TOGGLE = /^<Toggle label="([^"]*)"( defaultOn)? \/>$/;

const TOGGLE_OPEN = /<Toggle(?=[\s/>])/g;
const DEFAULT_ON_ATTRIBUTE = /\s+defaultOn(?:=\{(?:true|false)\})?(?=[\s/>])/;

export function parseToggleLine(line: string): ToggleData | null {
  const match = CANONICAL_TOGGLE.exec(line.trimEnd());
  if (!match) return null;
  return {
    label: unescapeAttribute(match[1]!),
    checked: Boolean(match[2]),
  };
}

export function serializeToggle({ label, checked }: ToggleData): string {
  return `<Toggle label="${escapeAttribute(label)}"${checked ? ' defaultOn' : ''} />`;
}

/**
 * Repère les balises `<Toggle` hors code, dans l'ordre du document. L'ordre
 * sert d'identifiant : c'est le seul lien stable entre un composant rendu par
 * l'aperçu et sa position dans la source.
 */
export function findToggleTags(source: string): Array<{ start: number; end: number }> {
  const mask = buildCodeMask(source);
  const tags: Array<{ start: number; end: number }> = [];

  TOGGLE_OPEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOGGLE_OPEN.exec(source)) !== null) {
    if (mask[match.index]) continue;
    const close = source.indexOf('>', match.index);
    if (close === -1) break;
    tags.push({ start: match.index, end: close + 1 });
  }

  return tags;
}

/** Ajoute `__toggleIndex={n}` à chaque `<Toggle` pour que l'aperçu sache lequel est cliqué. */
export function indexToggles(source: string): string {
  let result = '';
  let cursor = 0;
  findToggleTags(source).forEach(({ start }, index) => {
    const nameEnd = start + '<Toggle'.length;
    result += `${source.slice(cursor, nameEnd)} __toggleIndex={${index}}`;
    cursor = nameEnd;
  });
  return result + source.slice(cursor);
}

/** Coche ou décoche le n-ième `<Toggle` de la source. Renvoie la source inchangée si absent. */
export function setToggleChecked(source: string, index: number, checked: boolean): string {
  const tag = findToggleTags(source)[index];
  if (!tag) return source;

  let markup = source.slice(tag.start, tag.end).replace(DEFAULT_ON_ATTRIBUTE, '');
  if (checked) {
    const selfClosing = /\s*\/>$/.exec(markup);
    const insertAt = selfClosing ? selfClosing.index : markup.length - 1;
    markup = `${markup.slice(0, insertAt)} defaultOn${markup.slice(insertAt)}`;
  }

  return source.slice(0, tag.start) + markup + source.slice(tag.end);
}

// Seul le guillemet est échappé : échapper aussi `&` réécrirait un libellé
// comme `R&D`, valide tel quel en JSX, dès le premier aller-retour.
function escapeAttribute(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function unescapeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"');
}
