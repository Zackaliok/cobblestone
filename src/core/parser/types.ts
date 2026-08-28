import type { WikiLink } from '../workspace/types';

export interface Heading {
  level: number;
  text: string;
  /** Ancre dérivée du texte, utilisable comme `id` dans le rendu. */
  slug: string;
}

export interface ParsedDocument {
  frontmatter: Record<string, unknown>;
  /** Corps du document, frontmatter retiré. */
  content: string;
  links: WikiLink[];
  headings: Heading[];
  /** `true` si le frontmatter était présent mais invalide — le bloc est alors conservé tel quel. */
  frontmatterError?: string;
}
