/**
 * Convertisseur MDX <-> blocs Editor.js.
 *
 * Contrainte directrice : **le round-trip ne doit rien perdre**. L'utilisateur
 * doit pouvoir ouvrir un fichier en WYSIWYG, ne rien toucher, sauvegarder, et
 * retrouver son fichier intact — sinon l'éditeur détruit la doc à chaque
 * ouverture, et le diff Git devient illisible.
 *
 * Corollaire assumé : tout ce que le modèle de blocs ne sait pas représenter
 * fidèlement (JSX, code avec langage, listes imbriquées, tableaux hors forme
 * GFM) part dans un bloc `mdx` brut plutôt que d'être approximé. Mieux vaut un
 * bloc monospace qu'une conversion destructrice.
 */

import { buildCodeMask } from './MDXParser';

export type EditorBlock =
  | { type: 'header'; data: { text: string; level: number } }
  | { type: 'paragraph'; data: { text: string } }
  | { type: 'list'; data: { style: 'ordered' | 'unordered'; items: string[] } }
  | { type: 'checklist'; data: { items: Array<{ text: string; checked: boolean }> } }
  | { type: 'quote'; data: { text: string; caption: string } }
  | { type: 'image'; data: { src: string; alt: string } }
  | { type: 'delimiter'; data: Record<string, never> }
  | { type: 'callout'; data: { type: CalloutType; text: string } }
  | { type: 'table'; data: TableData }
  | { type: 'mdx'; data: { code: string } };

export const CALLOUT_TYPES = ['info', 'warning', 'danger', 'success'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

/** Alignement d'une colonne, lu dans la ligne de séparation (`:---`, `:---:`, `---:`). */
export type TableAlign = 'left' | 'center' | 'right' | null;

/**
 * Donnée du bloc tableau, au format de `@editorjs/table` complété de ce que le
 * Markdown porte en plus.
 */
export interface TableData {
  /**
   * La première ligne de `content` est l'en-tête. Un tableau GFM en a toujours
   * une : « sans en-têtes » s'écrit avec une ligne d'en-tête vide.
   */
  withHeadings: boolean;
  /** Cellules en HTML inline, comme le texte des autres blocs. */
  content: string[][];
  /** Alignement par colonne ; absent ou plus court : alignement par défaut. */
  align?: TableAlign[];
  /**
   * Lignes Markdown d'origine. Une ligne dont les cellules n'ont pas changé est
   * réécrite telle quelle : ni le formatage (colonnes alignées, pipes de fin
   * omis) ni le diff Git ne bougent hors des lignes réellement modifiées.
   */
  source?: string[];
}

export interface EditorDocument {
  blocks: EditorBlock[];
  time?: number;
  version?: string;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED_ITEM = /^[-*+]\s+(.*)$/;
const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/;
/**
 * Élément de liste de tâches, sous la seule forme que le bloc checklist sait
 * réécrire à l'identique : `- [ ] ` ou `- [x] `. Les variantes (`* [X]`,
 * `1. [ ]`) restent des listes ordinaires, où la case est du simple texte.
 */
const TASK_ITEM = /^- \[( |x)\] (.*)$/;
/**
 * Image seule sur sa ligne : `![texte alternatif](chemin)`. Avec un titre
 * (`![a](b "titre")`) ou au milieu d'un paragraphe, elle reste du texte : le
 * bloc image ne saurait pas la réécrire à l'identique.
 */
const IMAGE_LINE = /^!\[([^\]\n]*)\]\(([^()\s]+)\)$/;
const THEMATIC_BREAK = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_OPEN = /^(`{3,}|~{3,})(.*)$/;
const JSX_OPEN = /^<([A-Za-z][\w.-]*)/;
const MDX_STATEMENT = /^(?:import|export)\s/;

// ---------------------------------------------------------------------------
// MDX -> blocs
// ---------------------------------------------------------------------------

export function mdxToBlocks(content: string): EditorBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: EditorBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      index = consumeFencedCode(lines, index, fence[1]!, blocks);
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      blocks.push({ type: 'delimiter', data: {} });
      index += 1;
      continue;
    }

    // Suivie d'une ligne de texte, l'image fait partie d'un paragraphe Markdown :
    // la séparer ajouterait une ligne vide au fichier.
    const image = IMAGE_LINE.exec(line);
    if (image && (lines[index + 1] ?? '').trim() === '') {
      blocks.push({ type: 'image', data: { alt: image[1]!, src: image[2]! } });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'header',
        data: { text: markdownToHtml(heading[2]!.trim()), level: heading[1]!.length },
      });
      index += 1;
      continue;
    }

    if (MDX_STATEMENT.test(line)) {
      index = consumeRawChunk(lines, index, blocks);
      continue;
    }

    if (line.startsWith('<')) {
      index = consumeJsx(lines, index, blocks);
      continue;
    }

    if (line.trimStart().startsWith('|')) {
      index = consumeTable(lines, index, blocks);
      continue;
    }

    if (line.startsWith('>')) {
      index = consumeQuote(lines, index, blocks);
      continue;
    }

    if (UNORDERED_ITEM.test(line) || ORDERED_ITEM.test(line)) {
      index = consumeList(lines, index, blocks);
      continue;
    }

    index = consumeParagraph(lines, index, blocks);
  }

  return blocks;
}

function consumeFencedCode(
  lines: string[],
  start: number,
  fence: string,
  blocks: EditorBlock[],
): number {
  const collected = [lines[start]!];
  let index = start + 1;

  while (index < lines.length) {
    const line = lines[index]!;
    collected.push(line);
    index += 1;
    const closing = FENCE_OPEN.exec(line);
    if (closing && closing[1]!.startsWith(fence[0]!) && closing[1]!.length >= fence.length) {
      break;
    }
  }

  blocks.push({ type: 'mdx', data: { code: collected.join('\n') } });
  return index;
}

/**
 * Consomme un composant JSX. On cherche la balise fermante correspondante ;
 * une balise auto-fermante tient sur son seul groupe de lignes.
 */
function consumeJsx(lines: string[], start: number, blocks: EditorBlock[]): number {
  const match = JSX_OPEN.exec(lines[start]!);
  if (!match) return consumeRawChunk(lines, start, blocks);

  const tag = match[1]!;
  const closing = `</${tag}>`;
  const collected: string[] = [];
  let index = start;
  let selfClosing = false;

  // La balise ouvrante peut s'étaler sur plusieurs lignes (attributs longs).
  while (index < lines.length) {
    const line = lines[index]!;
    collected.push(line);
    index += 1;
    if (line.includes('/>')) {
      selfClosing = true;
      break;
    }
    if (line.includes('>')) break;
  }

  if (!selfClosing) {
    while (index < lines.length) {
      const line = lines[index]!;
      collected.push(line);
      index += 1;
      if (line.includes(closing)) break;
    }
  }

  const code = collected.join('\n');
  const callout = tag === 'Callout' ? parseSimpleCallout(collected) : null;
  blocks.push(callout ?? { type: 'mdx', data: { code } });
  return index;
}

/**
 * Un Callout ne devient un bloc éditable que sous la forme exacte que
 * `blocksToMdx` sait réécrire : balise ouvrante `type="…"` seule sur sa ligne,
 * corps de texte inline indenté de deux espaces, balise fermante seule. Tout
 * le reste (ligne vide, titre, liste, JSX imbriqué, attribut en plus) reste du
 * MDX brut pour que le round-trip ne perde rien.
 */
function parseSimpleCallout(lines: string[]): EditorBlock | null {
  if (lines.length < 3) return null;
  const open = /^<Callout type="(info|warning|danger|success)">$/.exec(lines[0]!);
  if (!open || lines[lines.length - 1] !== '</Callout>') return null;

  const body = lines.slice(1, -1);
  // Callout fraîchement inséré : une seule ligne d'indentation, texte vide.
  if (body.length === 1 && body[0] === '  ') {
    return { type: 'callout', data: { type: open[1] as CalloutType, text: '' } };
  }
  const blockSyntax = /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|<|\||```|~~~|!\[|import\s|export\s)/;
  for (const line of body) {
    if (!line.startsWith('  ') || line.trim() === '' || line.startsWith('   ')) return null;
    if (blockSyntax.test(line.slice(2)) || line.includes('</Callout>')) return null;
  }

  return {
    type: 'callout',
    data: {
      type: open[1] as CalloutType,
      text: markdownToHtml(body.map((line) => line.slice(2)).join('\n')),
    },
  };
}

function consumeTable(lines: string[], start: number, blocks: EditorBlock[]): number {
  const collected: string[] = [];
  let index = start;

  while (index < lines.length && lines[index]!.trimStart().startsWith('|')) {
    collected.push(lines[index]!);
    index += 1;
  }

  const table = parseTable(collected);
  blocks.push(
    table ? { type: 'table', data: table } : { type: 'mdx', data: { code: collected.join('\n') } },
  );
  return index;
}

/** Bloc brut délimité par une ligne vide. */
function consumeRawChunk(lines: string[], start: number, blocks: EditorBlock[]): number {
  const collected: string[] = [];
  let index = start;

  while (index < lines.length && lines[index]!.trim() !== '') {
    collected.push(lines[index]!);
    index += 1;
  }

  blocks.push({ type: 'mdx', data: { code: collected.join('\n') } });
  return index;
}

function consumeQuote(lines: string[], start: number, blocks: EditorBlock[]): number {
  const collected: string[] = [];
  let index = start;

  while (index < lines.length && lines[index]!.startsWith('>')) {
    collected.push(lines[index]!.replace(/^>\s?/, ''));
    index += 1;
  }

  blocks.push({
    type: 'quote',
    data: { text: markdownToHtml(collected.join('\n')), caption: '' },
  });
  return index;
}

function consumeList(lines: string[], start: number, blocks: EditorBlock[]): number {
  const ordered = ORDERED_ITEM.test(lines[start]!);
  const pattern = ordered ? ORDERED_ITEM : UNORDERED_ITEM;
  const items: string[] = [];
  const collected: string[] = [];
  let index = start;
  let nested = false;

  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trim() === '') break;

    // Un item indenté signale une liste imbriquée : le tool Editor.js v1 est à
    // plat, on bascule le bloc entier en brut pour ne rien aplatir.
    if (/^\s+/.test(line)) {
      if (UNORDERED_ITEM.test(line.trimStart()) || ORDERED_ITEM.test(line.trimStart())) {
        nested = true;
        collected.push(line);
        index += 1;
        continue;
      }
      break;
    }

    const match = pattern.exec(line);
    if (!match) break;

    items.push(markdownToHtml(match[1]!));
    collected.push(line);
    index += 1;
  }

  if (nested) {
    blocks.push({ type: 'mdx', data: { code: collected.join('\n') } });
  } else if (collected.every((line) => TASK_ITEM.test(line))) {
    blocks.push({
      type: 'checklist',
      data: {
        items: collected.map((line) => {
          const [, mark, text] = TASK_ITEM.exec(line)!;
          return { text: markdownToHtml(text!), checked: mark === 'x' };
        }),
      },
    });
  } else {
    blocks.push({
      type: 'list',
      data: { style: ordered ? 'ordered' : 'unordered', items },
    });
  }

  return index;
}

function consumeParagraph(lines: string[], start: number, blocks: EditorBlock[]): number {
  const collected: string[] = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index]!;
    if (
      line.trim() === '' ||
      HEADING.test(line) ||
      THEMATIC_BREAK.test(line) ||
      FENCE_OPEN.test(line) ||
      line.startsWith('>') ||
      line.startsWith('<') ||
      UNORDERED_ITEM.test(line) ||
      ORDERED_ITEM.test(line)
    ) {
      break;
    }
    collected.push(line);
    index += 1;
  }

  blocks.push({ type: 'paragraph', data: { text: markdownToHtml(collected.join('\n')) } });
  return index;
}

// ---------------------------------------------------------------------------
// Diagrammes Mermaid
// ---------------------------------------------------------------------------

/** Ouverture ```` ```mermaid ```` : le langage est le premier mot de l'info string. */
const MERMAID_FENCE_OPEN = /^(`{3,}|~{3,})[ \t]*mermaid(?:[ \t].*)?$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Source du diagramme d'un bloc `mdx` qui ne contient qu'un bloc
 * ```` ```mermaid ````, sinon `null`. Une fence pas encore refermée compte :
 * le bloc reste reconnu pendant qu'on la tape.
 */
export function mermaidFenceSource(code: string): string | null {
  const [first = '', ...lines] = code.replace(/\r\n/g, '\n').split('\n');
  const open = MERMAID_FENCE_OPEN.exec(first);
  if (!open) return null;

  const fence = open[1]!;
  // Après des backticks, l'info string ne peut pas en contenir (CommonMark).
  if (fence.startsWith('`') && first.slice(fence.length).includes('`')) return null;

  const closing = lines.findIndex((line) => {
    const match = FENCE_CLOSE.exec(line);
    return match !== null && match[1]![0] === fence[0] && match[1]!.length >= fence.length;
  });
  if (closing === -1) return lines.join('\n');

  // Du contenu après la fence : le bloc n'est pas qu'un diagramme.
  if (lines.slice(closing + 1).some((line) => line.trim() !== '')) return null;
  return lines.slice(0, closing).join('\n');
}

// ---------------------------------------------------------------------------
// Blocs -> MDX
// ---------------------------------------------------------------------------

export function blocksToMdx(blocks: EditorBlock[]): string {
  const chunks: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'header': {
        const level = Math.min(Math.max(block.data.level, 1), 6);
        chunks.push(`${'#'.repeat(level)} ${htmlToMarkdown(block.data.text)}`);
        break;
      }
      case 'paragraph':
        chunks.push(htmlToMarkdown(block.data.text));
        break;
      case 'list': {
        const lines = block.data.items.map((item, position) =>
          block.data.style === 'ordered'
            ? `${position + 1}. ${htmlToMarkdown(item)}`
            : `- ${htmlToMarkdown(item)}`,
        );
        chunks.push(lines.join('\n'));
        break;
      }
      case 'checklist':
        chunks.push(
          block.data.items
            .map((item) => `- [${item.checked ? 'x' : ' '}] ${htmlToMarkdown(item.text)}`)
            .join('\n'),
        );
        break;
      case 'quote': {
        const body = htmlToMarkdown(block.data.text)
          .split('\n')
          .map((line) => (line ? `> ${line}` : '>'))
          .join('\n');
        const caption = block.data.caption ? htmlToMarkdown(block.data.caption) : '';
        chunks.push(caption ? `${body}\n>\n> — ${caption}` : body);
        break;
      }
      case 'image':
        // Un bloc image inséré mais laissé sans chemin ne produit rien.
        if (block.data.src.trim()) {
          chunks.push(`![${block.data.alt.replace(/[\]\n]/g, ' ')}](${block.data.src.trim()})`);
        }
        break;
      case 'delimiter':
        chunks.push('---');
        break;
      case 'callout': {
        const type = CALLOUT_TYPES.includes(block.data.type) ? block.data.type : 'info';
        // Une ligne vide ou un texte vide ne se réécrit pas en forme simple.
        const body = htmlToMarkdown(block.data.text)
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => `  ${line}`);
        chunks.push([`<Callout type="${type}">`, ...(body.length ? body : ['  ']), '</Callout>'].join('\n'));
        break;
      }
      case 'table':
        chunks.push(tableToMarkdown(block.data));
        break;
      case 'mdx':
        chunks.push(block.data.code);
        break;
    }
  }

  return `${chunks.filter((chunk) => chunk.trim() !== '').join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// Tableaux GFM
// ---------------------------------------------------------------------------

const DELIMITER_CELL = /^:?-+:?$/;
const WIKI_LINK = /\[\[[^\][\n]+\]\]/g;
const BR_TAG = /<br\s*\/?>/gi;

/**
 * Un tableau ne devient un bloc éditable que s'il est du GFM sans ambiguïté :
 * lignes non indentées, ligne de séparation valide, autant de colonnes dans
 * l'en-tête que dans la séparation, aucune ligne plus large que l'en-tête (le
 * rendu ignorerait les cellules en trop, l'éditeur les afficherait). Le reste
 * reste en MDX brut.
 */
function parseTable(lines: string[]): TableData | null {
  if (lines.length < 2 || lines.some((line) => !line.startsWith('|'))) return null;

  const [header, delimiter, ...body] = lines.map(splitTableRow);
  const align = parseDelimiterRow(delimiter!);
  if (!align || align.length !== header!.length) return null;

  const width = header!.length;
  if (body.some((row) => row.length > width)) return null;

  // Une ligne d'en-tête vide est l'écriture GFM d'un tableau sans en-tête.
  const withHeadings = body.length === 0 || header!.some((cell) => cell !== '');
  const rows = withHeadings ? [header!, ...body] : body;

  return {
    withHeadings,
    content: rows.map((row) => padRow(row, width).map(tableCellToHtml)),
    align,
    source: lines,
  };
}

function tableToMarkdown(data: TableData): string {
  const rows = data.content.map((row) => row.map(tableCellToMarkdown));
  const width = Math.max(0, ...rows.map((row) => row.length));
  // Plus aucune cellule : le tableau a été vidé, il ne produit rien.
  if (width === 0) return '';

  const cells = rows.map((row) => padRow(row, width));
  const header = data.withHeadings ? cells[0]! : padRow([], width);
  const body = data.withHeadings ? cells.slice(1) : cells;
  const align = Array.from({ length: width }, (_, column) => data.align?.[column] ?? null);

  const original = indexSourceLines(data.source ?? []);
  const line = (row: string[]): string =>
    original.rows.get(rowKey(row))?.shift() ?? `| ${row.join(' | ')} |`;

  const delimiter =
    original.delimiter && sameAlign(original.delimiter.align, align)
      ? original.delimiter.line
      : `| ${align.map(delimiterCell).join(' | ')} |`;

  return [line(header), delimiter, ...body.map(line)].join('\n');
}

/**
 * Range les lignes d'origine par contenu, tel qu'il ressortirait de l'éditeur
 * s'il n'y avait pas été touché. Une file par contenu : deux lignes identiques
 * sont réutilisées chacune une fois.
 */
function indexSourceLines(source: string[]): {
  rows: Map<string, string[]>;
  delimiter: { line: string; align: TableAlign[] } | null;
} {
  const rows = new Map<string, string[]>();
  if (source.length < 2) return { rows, delimiter: null };

  const align = parseDelimiterRow(splitTableRow(source[1]!));
  if (!align) return { rows, delimiter: null };

  source.forEach((line, position) => {
    if (position === 1) return;
    const cells = padRow(splitTableRow(line), align.length).map((cell) =>
      tableCellToMarkdown(tableCellToHtml(cell)),
    );
    const key = rowKey(cells);
    rows.set(key, [...(rows.get(key) ?? []), line]);
  });

  return { rows, delimiter: { line: source[1]!, align } };
}

/**
 * Le navigateur rend une espace insécable en `&nbsp;`, que l'aller-retour
 * inline change en espace simple : la comparaison les confond pour qu'une
 * ligne non modifiée garde ses insécables.
 */
function rowKey(cells: string[]): string {
  return JSON.stringify(cells.map((cell) => cell.replace(/\u00a0/g, ' ')));
}

function sameAlign(a: TableAlign[], b: TableAlign[]): boolean {
  return a.length === b.length && a.every((value, column) => value === b[column]);
}

function padRow(row: string[], width: number): string[] {
  return [...row, ...new Array<string>(Math.max(0, width - row.length)).fill('')];
}

function parseDelimiterRow(cells: string[]): TableAlign[] | null {
  if (!cells.every((cell) => DELIMITER_CELL.test(cell))) return null;
  return cells.map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (left) return 'left';
    return right ? 'right' : null;
  });
}

function delimiterCell(align: TableAlign): string {
  if (align === 'center') return ':---:';
  if (align === 'left') return ':---';
  return align === 'right' ? '---:' : '---';
}

/**
 * Découpe une ligne `| a | b |` en cellules, comme GFM : un `|` échappé (`\|`)
 * reste dans la cellule, le pipe final est facultatif.
 *
 * Un wiki-link `[[page|libellé]]` est d'un seul tenant : l'aperçu le remplace
 * avant que le tableau ne soit analysé, son `|` n'y sépare donc rien.
 */
function splitTableRow(line: string): string[] {
  const text = line.trim();
  const links = wikiLinkSpans(text);
  const cells: string[] = [];
  let cell = '';
  let closed = false;
  let index = 1; // le `|` d'ouverture

  while (index < text.length) {
    const linkEnd = links.get(index);
    const char = text[index]!;
    closed = false;

    if (linkEnd !== undefined) {
      cell += text.slice(index, linkEnd);
      index = linkEnd;
    } else if (char === '\\' && index + 1 < text.length) {
      cell += text.slice(index, index + 2);
      index += 2;
    } else if (char === '|') {
      cells.push(cell.trim());
      cell = '';
      closed = true;
      index += 1;
    } else {
      cell += char;
      index += 1;
    }
  }

  if (!closed) cells.push(cell.trim());
  return cells;
}

/** Début -> fin des wiki-links situés hors du code. */
function wikiLinkSpans(text: string): Map<number, number> {
  const mask = buildCodeMask(text);
  const spans = new Map<number, number>();
  for (const match of text.matchAll(WIKI_LINK)) {
    if (!mask[match.index]) spans.set(match.index, match.index + match[0].length);
  }
  return spans;
}

/**
 * Applique `replace` à chaque caractère hors wiki-link, les échappements `\x`
 * étant lus d'un bloc : `\\|` est une barre oblique échappée suivie d'un pipe.
 */
function mapTableText(text: string, replace: (token: string) => string): string {
  const links = wikiLinkSpans(text);
  let result = '';
  let index = 0;

  while (index < text.length) {
    const linkEnd = links.get(index);
    if (linkEnd !== undefined) {
      result += text.slice(index, linkEnd);
      index = linkEnd;
      continue;
    }
    const length = text[index] === '\\' && index + 1 < text.length ? 2 : 1;
    result += replace(text.slice(index, index + length));
    index += length;
  }

  return result;
}

/**
 * Cellule Markdown -> HTML de l'éditeur. Le `\|` imposé par la syntaxe des
 * tableaux s'affiche en simple `|`, et un `<br>` (seule façon d'aller à la
 * ligne dans une cellule) en vrai saut de ligne.
 */
function tableCellToHtml(cell: string): string {
  const text = mapTableText(cell, (token) => (token === '\\|' ? '|' : token));
  const mask = buildCodeMask(text);
  return markdownToHtml(text.replace(BR_TAG, (tag, offset: number) => (mask[offset] ? tag : '\n')));
}

/** Inverse de `tableCellToHtml` : tout ce qui casserait la ligne est échappé. */
function tableCellToMarkdown(html: string): string {
  const markdown = htmlToMarkdown(html).trim();
  return mapTableText(markdown, (token) => (token === '|' ? '\\|' : token)).replace(/\s*\n\s*/g, '<br />');
}

// ---------------------------------------------------------------------------
// Inline : markdown <-> HTML
// ---------------------------------------------------------------------------

/**
 * Editor.js manipule du HTML inline. On échappe d'abord tout le texte, ce qui
 * rend le passage réversible : un `<Badge/>` écrit au fil du texte réapparaît
 * intact côté MDX au lieu d'être interprété comme du balisage.
 */
export function markdownToHtml(markdown: string): string {
  let text = escapeHtml(markdown);

  const codeSpans: string[] = [];
  // Les spans de code sont mis de côté pour que `**` à l'intérieur ne soit pas
  // interprété comme du gras.
  text = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(code);
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^_]+)__/g, '<b>$1</b>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  text = text.replace(/(^|[^\w_])_([^_\n]+)_/g, '$1<i>$2</i>');
  text = text.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_match, position: string) => {
    return `<code class="inline-code">${codeSpans[Number(position)]}</code>`;
  });

  return text.replace(/\n/g, '<br>');
}

export function htmlToMarkdown(html: string): string {
  let text = html.replace(/<br\s*\/?>/gi, '\n');

  // Les balises sont dépliées de l'intérieur vers l'extérieur : on répète tant
  // que le texte change, ce qui gère les imbrications (<b><i>…</i></b>).
  const rules: Array<[RegExp, string]> = [
    [/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`'],
    [/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)'],
    [/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**'],
    [/<(?:i|em)[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, '*$1*'],
    [/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '==$1=='],
    [/<u[^>]*>([\s\S]*?)<\/u>/gi, '$1'],
  ];

  for (let pass = 0; pass < 8; pass += 1) {
    const before = text;
    for (const [pattern, replacement] of rules) {
      text = text.replace(pattern, replacement);
    }
    if (text === before) break;
  }

  // Editor.js ajoute parfois des <span> de mise en forme sans valeur sémantique.
  text = text.replace(/<\/?span[^>]*>/gi, '');

  return unescapeHtml(text);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
