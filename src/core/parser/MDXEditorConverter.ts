/**
 * Convertisseur MDX <-> blocs Editor.js.
 *
 * Contrainte directrice : **le round-trip ne doit rien perdre**. L'utilisateur
 * doit pouvoir ouvrir un fichier en WYSIWYG, ne rien toucher, sauvegarder, et
 * retrouver son fichier intact — sinon l'éditeur détruit la doc à chaque
 * ouverture, et le diff Git devient illisible.
 *
 * Corollaire assumé : tout ce que le modèle de blocs ne sait pas représenter
 * fidèlement (JSX, tableaux, code avec langage, listes imbriquées) part dans un
 * bloc `mdx` brut plutôt que d'être approximé. Mieux vaut un bloc monospace
 * qu'une conversion destructrice.
 */

export type EditorBlock =
  | { type: 'header'; data: { text: string; level: number } }
  | { type: 'paragraph'; data: { text: string } }
  | { type: 'list'; data: { style: 'ordered' | 'unordered'; items: string[] } }
  | { type: 'quote'; data: { text: string; caption: string } }
  | { type: 'delimiter'; data: Record<string, never> }
  | { type: 'mdx'; data: { code: string } };

export interface EditorDocument {
  blocks: EditorBlock[];
  time?: number;
  version?: string;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED_ITEM = /^[-*+]\s+(.*)$/;
const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/;
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

  blocks.push({ type: 'mdx', data: { code: collected.join('\n') } });
  return index;
}

function consumeTable(lines: string[], start: number, blocks: EditorBlock[]): number {
  const collected: string[] = [];
  let index = start;

  while (index < lines.length && lines[index]!.trimStart().startsWith('|')) {
    collected.push(lines[index]!);
    index += 1;
  }

  blocks.push({ type: 'mdx', data: { code: collected.join('\n') } });
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
      case 'quote': {
        const body = htmlToMarkdown(block.data.text)
          .split('\n')
          .map((line) => (line ? `> ${line}` : '>'))
          .join('\n');
        const caption = block.data.caption ? htmlToMarkdown(block.data.caption) : '';
        chunks.push(caption ? `${body}\n>\n> — ${caption}` : body);
        break;
      }
      case 'delimiter':
        chunks.push('---');
        break;
      case 'mdx':
        chunks.push(block.data.code);
        break;
    }
  }

  return `${chunks.filter((chunk) => chunk.trim() !== '').join('\n\n')}\n`;
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
