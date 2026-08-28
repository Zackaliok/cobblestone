import { dump, load } from 'js-yaml';

import { basename, pathToSlug } from '../filesystem/FileSystem';
import type { Note, ResolvedLink, WikiLink, Workspace } from '../workspace/types';
import { noteId } from '../workspace/types';
import type { Heading, ParsedDocument } from './types';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const WIKI_LINK_PATTERN = /\[\[([^\][\n]+)\]\]/g;
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/;

/**
 * Découpe le frontmatter YAML du corps du document.
 *
 * Un frontmatter syntaxiquement invalide ne fait pas échouer le parsing : le
 * bloc est laissé dans le corps et l'erreur est remontée. Perdre le contenu de
 * l'utilisateur parce qu'une indentation YAML est fausse serait pire que
 * l'afficher tel quel.
 */
export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  content: string;
  error?: string;
} {
  const match = FRONTMATTER_PATTERN.exec(raw);
  if (!match) return { frontmatter: {}, content: raw };

  try {
    const parsed = load(match[1]!);
    if (parsed === null || parsed === undefined) {
      return { frontmatter: {}, content: raw.slice(match[0].length) };
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        frontmatter: {},
        content: raw,
        error: 'Le frontmatter doit être un objet YAML',
      };
    }
    return {
      frontmatter: parsed as Record<string, unknown>,
      content: raw.slice(match[0].length),
    };
  } catch (error) {
    return {
      frontmatter: {},
      content: raw,
      error: error instanceof Error ? error.message : 'Frontmatter YAML invalide',
    };
  }
}

/** Recompose un document complet à partir de son frontmatter et de son corps. */
export function serializeDocument(
  frontmatter: Record<string, unknown>,
  content: string,
): string {
  if (Object.keys(frontmatter).length === 0) return content;
  const yaml = dump(frontmatter, { lineWidth: 100, noRefs: true }).trimEnd();
  return `---\n${yaml}\n---\n\n${content.replace(/^\n+/, '')}`;
}

/**
 * Marque les caractères appartenant à du code : blocs délimités par ``` ou ~~~,
 * et spans inline entre backticks.
 *
 * Sans ce masque, un `[[exemple]]` cité dans un bloc de code documentant la
 * syntaxe des wiki-links serait indexé comme un vrai lien.
 */
export function buildCodeMask(content: string): boolean[] {
  const mask = new Array<boolean>(content.length).fill(false);
  const lines = content.split('\n');

  let offset = 0;
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);

    if (fence) {
      // On est dans un bloc : tout est masqué, y compris la ligne de fermeture.
      mask.fill(true, offset, offset + line.length);
      if (fenceMatch && fenceMatch[1]!.startsWith(fence[0]!) && fenceMatch[1]!.length >= fence.length) {
        fence = null;
      }
    } else if (fenceMatch) {
      fence = fenceMatch[1]!;
      mask.fill(true, offset, offset + line.length);
    } else {
      maskInlineCode(line, offset, mask);
    }

    offset += line.length + 1; // +1 pour le \n retiré par le split
  }

  return mask;
}

function maskInlineCode(line: string, offset: number, mask: boolean[]): void {
  let index = 0;

  while (index < line.length) {
    if (line[index] !== '`') {
      index += 1;
      continue;
    }

    let runLength = 0;
    while (line[index + runLength] === '`') runLength += 1;

    const delimiter = '`'.repeat(runLength);
    const closing = line.indexOf(delimiter, index + runLength);
    if (closing === -1) {
      // Backtick non fermé : on ne masque rien, le reste de la ligne est du texte.
      index += runLength;
      continue;
    }

    const end = closing + runLength;
    mask.fill(true, offset + index, offset + end);
    index = end;
  }
}

/**
 * Extrait les wiki-links du corps d'un document.
 *
 * Formes reconnues :
 *   `[[page]]`, `[[page|libellé]]`,
 *   `[[Workspace:dossier:page]]`, `[[Workspace:page|libellé]]`
 *
 * Le préfixe de workspace n'est qu'une *hypothèse* à ce stade : seul le
 * résolveur, qui connaît les workspaces ouverts, peut trancher entre un nom de
 * workspace et un simple segment de chemin contenant un `:`.
 */
export function extractWikiLinks(content: string): WikiLink[] {
  const mask = buildCodeMask(content);
  const links: WikiLink[] = [];

  WIKI_LINK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = WIKI_LINK_PATTERN.exec(content)) !== null) {
    if (mask[match.index]) continue;

    const inner = match[1]!;
    const pipe = inner.indexOf('|');
    const rawTarget = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const label = pipe === -1 ? undefined : inner.slice(pipe + 1).trim();
    if (!rawTarget) continue;

    const colon = rawTarget.indexOf(':');
    const workspaceHint = colon === -1 ? undefined : rawTarget.slice(0, colon).trim();
    const remainder = colon === -1 ? rawTarget : rawTarget.slice(colon + 1);

    links.push({
      raw: match[0],
      ...(workspaceHint ? { workspaceHint } : {}),
      target: normalizeTarget(remainder),
      ...(label ? { label } : {}),
      offset: match.index,
    });
  }

  return links;
}

/** `dossier:page.mdx` -> `dossier/page`. */
function normalizeTarget(target: string): string {
  return target
    .trim()
    .replace(/\\/g, '/')
    .replace(/:/g, '/')
    .replace(/\.(mdx|md)$/i, '')
    .replace(/^\/+|\/+$/g, '');
}

export function extractHeadings(content: string): Heading[] {
  const mask = buildCodeMask(content);
  const headings: Heading[] = [];

  let offset = 0;
  for (const line of content.split('\n')) {
    if (!mask[offset]) {
      const match = HEADING_PATTERN.exec(line);
      if (match) {
        const text = match[2]!;
        headings.push({ level: match[1]!.length, text, slug: slugifyHeading(text) });
      }
    }
    offset += line.length + 1;
  }

  return headings;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseDocument(raw: string): ParsedDocument {
  const { frontmatter, content, error } = parseFrontmatter(raw);
  return {
    frontmatter,
    content,
    links: extractWikiLinks(content),
    headings: extractHeadings(content),
    ...(error ? { frontmatterError: error } : {}),
  };
}

/** Construit une `Note` indexable à partir du contenu brut d'un fichier. */
export function parseNote(
  workspaceId: string,
  path: string,
  raw: string,
  updatedAt?: number,
): Note {
  const parsed = parseDocument(raw);
  const slug = pathToSlug(path);

  return {
    id: noteId(workspaceId, slug),
    workspaceId,
    path,
    slug,
    title: deriveTitle(parsed, path),
    frontmatter: parsed.frontmatter,
    content: parsed.content,
    links: parsed.links,
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

function deriveTitle(parsed: ParsedDocument, path: string): string {
  const fromFrontmatter = parsed.frontmatter['title'];
  if (typeof fromFrontmatter === 'string' && fromFrontmatter.trim()) {
    return fromFrontmatter.trim();
  }

  const firstHeading = parsed.headings.find((heading) => heading.level === 1);
  if (firstHeading) return firstHeading.text;

  return basename(path, true);
}

/**
 * Résout un wiki-link vers une note concrète.
 *
 * L'ambiguïté à trancher : dans `[[Wiki:process:onboarding]]`, `Wiki` est-il un
 * nom de workspace ou le premier dossier du chemin ? Règle retenue — le préfixe
 * n'est traité comme un workspace que s'il correspond au nom d'un workspace
 * ouvert. Sinon le lien reste local et le `:` redevient un séparateur de chemin.
 */
export function resolveWikiLink(
  link: WikiLink,
  currentWorkspaceId: string,
  workspaces: Workspace[],
  slugExists: (workspaceId: string, slug: string) => boolean,
): ResolvedLink {
  let targetWorkspaceId = currentWorkspaceId;
  let slug = link.target;

  if (link.workspaceHint) {
    const named = workspaces.find(
      (workspace) => workspace.name.toLowerCase() === link.workspaceHint!.toLowerCase(),
    );
    if (named) {
      targetWorkspaceId = named.id;
    } else {
      // Pas un workspace connu : le préfixe fait partie du chemin.
      slug = normalizeTarget(`${link.workspaceHint}/${link.target}`);
    }
  }

  if (slugExists(targetWorkspaceId, slug)) {
    return {
      link,
      targetId: noteId(targetWorkspaceId, slug),
      targetWorkspaceId,
      targetSlug: slug,
    };
  }

  return { link, targetId: null, targetWorkspaceId, targetSlug: slug };
}
