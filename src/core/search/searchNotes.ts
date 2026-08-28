import type { Note } from '../workspace/types';

export interface SearchHit {
  note: Note;
  score: number;
  /** Extrait du contenu autour de la première occurrence. */
  excerpt: string;
  /** Bornes des termes trouvés dans `excerpt`, pour la mise en évidence. */
  highlights: Array<{ start: number; end: number }>;
}

/** Minuscules + accents retirés : « Déploiement » doit matcher « deploiement ». */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const EXCERPT_RADIUS = 90;

/**
 * Recherche full-text sur les notes déjà indexées en mémoire.
 *
 * Tous les termes doivent être présents (ET implicite). Le classement favorise
 * le titre puis le chemin : dans un wiki, chercher « onboarding » doit d'abord
 * remonter la page qui s'appelle ainsi, pas les dix pages qui la citent.
 */
export function searchNotes(notes: Note[], query: string, limit = 60): SearchHit[] {
  const terms = normalize(query)
    .split(/\s+/)
    .filter((term) => term.length > 0);

  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];

  for (const note of notes) {
    const haystackTitle = normalize(note.title);
    const haystackSlug = normalize(note.slug);
    const haystackContent = normalize(note.content);
    const haystackTags = normalize(extractTags(note).join(' '));

    let score = 0;
    let matchesAll = true;

    for (const term of terms) {
      let termScore = 0;

      if (haystackTitle.includes(term)) termScore += haystackTitle === term ? 40 : 20;
      if (haystackSlug.includes(term)) termScore += 8;
      if (haystackTags.includes(term)) termScore += 6;

      const occurrences = countOccurrences(haystackContent, term);
      termScore += Math.min(occurrences, 10);

      if (termScore === 0) {
        matchesAll = false;
        break;
      }
      score += termScore;
    }

    if (!matchesAll) continue;

    hits.push({ note, score, ...buildExcerpt(note.content, haystackContent, terms) });
  }

  return hits.sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title)).slice(0, limit);
}

function extractTags(note: Note): string[] {
  const tags = note.frontmatter['tags'];
  if (Array.isArray(tags)) return tags.map((tag) => String(tag));
  if (typeof tags === 'string') return [tags];
  return [];
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * L'extrait est découpé sur le texte normalisé mais restitué depuis le texte
 * d'origine : les deux ont la même longueur, `normalize` ne faisant que
 * remplacer des caractères un pour un.
 */
function buildExcerpt(
  original: string,
  normalized: string,
  terms: string[],
): { excerpt: string; highlights: Array<{ start: number; end: number }> } {
  const first = terms
    .map((term) => normalized.indexOf(term))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];

  if (first === undefined) {
    return { excerpt: original.slice(0, EXCERPT_RADIUS * 2).trim(), highlights: [] };
  }

  const start = Math.max(0, first - EXCERPT_RADIUS);
  const end = Math.min(original.length, first + EXCERPT_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < original.length ? '…' : '';
  const excerpt = `${prefix}${original.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;

  const normalizedExcerpt = normalize(excerpt);
  const highlights: Array<{ start: number; end: number }> = [];

  for (const term of terms) {
    let index = normalizedExcerpt.indexOf(term);
    while (index !== -1) {
      highlights.push({ start: index, end: index + term.length });
      index = normalizedExcerpt.indexOf(term, index + term.length);
    }
  }

  return { excerpt, highlights: mergeRanges(highlights) };
}

function mergeRanges(
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}
