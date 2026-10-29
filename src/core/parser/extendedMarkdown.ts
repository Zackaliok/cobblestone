/**
 * Syntaxe Markdown étendue (https://www.markdownguide.org/extended-syntax/).
 *
 * L'essentiel vient de plugins existants, branchés dans l'aperçu : `remark-gfm`
 * (tableaux, barré, listes de tâches, notes de bas de page, liens automatiques),
 * `remark-definition-list` et `rehype-highlight`. Ce module couvre le reste, qui
 * n'a pas d'équivalent compatible MDX :
 *
 * - surlignage `==texte==`, indice `H~2~O`, exposant `x^2^` ;
 * - identifiants de titre `## Titre {#mon-ancre}` ;
 * - cases des listes de tâches cliquables, réécrites dans la source.
 */

import { HEADING_ID, buildCodeMask, splitHeadingId } from './MDXParser';

// ---------------------------------------------------------------------------
// Identifiants de titre
// ---------------------------------------------------------------------------

/**
 * En MDX, `{…}` est une expression JavaScript : `{#ancre}` ferait échouer la
 * compilation. On échappe les accolades des identifiants de titre, hors code,
 * pour qu'elles arrivent en texte jusqu'au plugin qui les interprète.
 */
export function escapeHeadingIds(source: string): string {
  const mask = buildCodeMask(source);
  let offset = 0;

  return source
    .split('\n')
    .map((line) => {
      const start = offset;
      offset += line.length + 1;
      if (mask[start] || !/^#{1,6}\s/.test(line)) return line;

      const match = HEADING_ID.exec(line);
      if (!match) return line;
      return `${line.slice(0, match.index)} \\{#${match[1]}\\}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Plugins unified (arbres mdast / hast, typés au minimum nécessaire)
// ---------------------------------------------------------------------------

interface TreeNode {
  type: string;
  value?: string;
  tagName?: string;
  children?: TreeNode[];
  properties?: Record<string, unknown>;
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const INLINE_MARK = /==([^=\n]+?)==|~([^~\s]+)~|\^([^^\s]+)\^/g;

/** Plugin remark : surlignage, indice, exposant et identifiants de titre. */
export function remarkExtendedMarkdown() {
  return (tree: TreeNode) => {
    walk(tree, (node) => {
      if (node.type === 'heading') applyHeadingId(node);
      if (node.children) node.children = node.children.flatMap(splitInlineMarks);
    });
  };
}

function applyHeadingId(heading: TreeNode): void {
  const last = heading.children?.at(-1);
  if (last?.type !== 'text' || !last.value) return;

  const { text, id } = splitHeadingId(last.value);
  if (!id) return;

  last.value = text;
  heading.data = { ...heading.data, hProperties: { ...heading.data?.hProperties, id } };
}

function splitInlineMarks(node: TreeNode): TreeNode[] {
  if (node.type !== 'text' || !node.value) return [node];

  const value = node.value;
  const parts: TreeNode[] = [];
  let cursor = 0;

  INLINE_MARK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_MARK.exec(value)) !== null) {
    if (match.index > cursor) parts.push({ type: 'text', value: value.slice(cursor, match.index) });

    const [, highlighted, subscript, superscript] = match;
    const tagName = highlighted !== undefined ? 'mark' : subscript !== undefined ? 'sub' : 'sup';
    parts.push({
      type: tagName,
      children: [{ type: 'text', value: (highlighted ?? subscript ?? superscript)! }],
      data: { hName: tagName },
    });
    cursor = match.index + match[0].length;
  }

  if (parts.length === 0) return [node];
  if (cursor < value.length) parts.push({ type: 'text', value: value.slice(cursor) });
  return parts;
}

/**
 * Plugin rehype : numérote les cases des listes de tâches dans l'ordre du
 * document et les rend cliquables (`remark-gfm` les produit désactivées).
 * Le numéro fait le lien avec `setTaskChecked`.
 */
export function rehypeTaskListIndex() {
  return (tree: TreeNode) => {
    let index = 0;
    walk(tree, (node) => {
      if (node.tagName !== 'input' || node.properties?.type !== 'checkbox') return;
      const { disabled: _disabled, ...properties } = node.properties;
      node.properties = { ...properties, dataTaskIndex: index };
      index += 1;
    });
  };
}

function walk(node: TreeNode, visit: (node: TreeNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

// ---------------------------------------------------------------------------
// Listes de tâches dans la source
// ---------------------------------------------------------------------------

/**
 * `- [ ] tâche`, `1. [x] tâche`, y compris dans une citation ou une liste
 * imbriquée. Comme pour GFM, une case sans texte après n'en est pas une.
 */
const TASK_MARKER = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+\S)/;

/** Positions des cases `[ ]` / `[x]` de la source, hors blocs de code. */
export function findTaskMarkers(source: string): Array<{ offset: number; checked: boolean }> {
  const mask = buildCodeMask(source);
  const markers: Array<{ offset: number; checked: boolean }> = [];
  let lineStart = 0;

  for (const line of source.split('\n')) {
    const match = TASK_MARKER.exec(line);
    if (match && !mask[lineStart]) {
      markers.push({ offset: lineStart + match[1]!.length, checked: match[2] !== ' ' });
    }
    lineStart += line.length + 1;
  }

  return markers;
}

/** Coche ou décoche la n-ième case de la source. Renvoie la source inchangée si absente. */
export function setTaskChecked(source: string, index: number, checked: boolean): string {
  const marker = findTaskMarkers(source)[index];
  if (!marker || marker.checked === checked) return source;
  return `${source.slice(0, marker.offset)}${checked ? 'x' : ' '}${source.slice(marker.offset + 1)}`;
}

// ---------------------------------------------------------------------------
// Fichiers .md
// ---------------------------------------------------------------------------

/** Un `.md` est du Markdown : le JSX et les expressions n'y ont pas cours. */
export function isPlainMarkdown(path: string): boolean {
  return /\.md$/i.test(path);
}

/** Balises HTML d'un document, laissées telles quelles dans un `.md`. */
const DOCUMENT_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'br',
  'button', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'dfn',
  'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'header', 'hr', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'li', 'main', 'mark',
  'nav', 'ol', 'p', 'picture', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'small',
  'source', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'time', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr',
  'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect',
]);

/** Éléments vides : `<br>` est du HTML valide, mais du JSX invalide. */
const VOID_TAGS = new Set(['br', 'col', 'hr', 'img', 'input', 'source', 'track', 'wbr']);

const TAG_OPENING = /<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/y;
const HTML_COMMENT = /<!--([\s\S]*?)-->/y;

/**
 * Prépare un `.md` pour le compilateur MDX de l'aperçu.
 *
 * Un `.md` passe par le même compilateur que les `.mdx` pour garder les
 * composants (`<Callout>`…) et les wiki-links, mais `<` et `{` y sont du texte :
 * `Observable<boolean>` ou `if (x) { … }` ne doivent pas faire échouer la
 * compilation. Hors code, on échappe donc les accolades et tout `<` qui n'ouvre
 * ni ne ferme une balise HTML de document ou l'un des `components` connus. Les
 * commentaires HTML deviennent des commentaires MDX, les éléments vides sont
 * refermés (`<br>` -> `<br />`).
 */
export function escapeMarkdownForMdx(source: string, components: Iterable<string>): string {
  const known = new Set(components);
  const mask = buildCodeMask(source);
  let result = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;
    if (mask[index] || isEscaped(source, index) || !'<{}'.includes(char)) {
      result += char;
      index += 1;
      continue;
    }

    if (char === '<') {
      HTML_COMMENT.lastIndex = index;
      const comment = HTML_COMMENT.exec(source);
      if (comment) {
        result += `{/*${comment[1]!.replace(/\*\//g, '* /')}*/}`;
        index = HTML_COMMENT.lastIndex;
        continue;
      }

      TAG_OPENING.lastIndex = index;
      const tag = TAG_OPENING.exec(source);
      const name = tag?.[2];
      const kept = name !== undefined && (DOCUMENT_TAGS.has(name) || known.has(name));
      const end = kept ? findTagEnd(source, TAG_OPENING.lastIndex) : -1;
      if (tag && end !== -1) {
        const text = source.slice(index, end + 1);
        const unclosedVoid = !tag[1] && VOID_TAGS.has(name!) && !text.endsWith('/>');
        result += unclosedVoid ? `${text.slice(0, -1).trimEnd()} />` : text;
        index = end + 1;
        continue;
      }
    }

    result += `\\${char}`;
    index += 1;
  }

  return result;
}

/** Position du `>` qui ferme la balise, en sautant chaînes et expressions d'attributs ; -1 si absent. */
function findTagEnd(source: string, from: number): number {
  let quote: string | null = null;
  let depth = 0;

  for (let index = from; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    } else if (char === '>' && depth === 0) {
      return index;
    }
  }

  return -1;
}

/** Le caractère est-il précédé d'un nombre impair de `\` ? */
function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  while (source[index - 1 - backslashes] === '\\') backslashes += 1;
  return backslashes % 2 === 1;
}
