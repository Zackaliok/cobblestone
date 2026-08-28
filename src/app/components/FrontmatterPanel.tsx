import { dump } from 'js-yaml';
import { useEffect, useState } from 'react';

import { parseFrontmatter, serializeDocument } from '../../core/parser/MDXParser';
import { useDocStore } from '../store/DocStore';

/**
 * Édition du frontmatter en mode WYSIWYG.
 *
 * Le YAML est édité tel quel, pas via un formulaire : les frontmatters réels
 * contiennent des listes, des dates, des clés maison, et un formulaire figé
 * empêcherait d'en ajouter. Le texte n'est réinjecté dans le document que
 * lorsqu'il est valide — sinon on garderait le fichier dans un état cassé.
 */
export function FrontmatterPanel() {
  const draft = useDocStore((state) => state.draft);
  const setDraft = useDocStore((state) => state.setDraft);
  const open = useDocStore((state) => state.open);

  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const documentKey = open ? `${open.workspaceId}::${open.path}` : '';

  useEffect(() => {
    const { frontmatter } = parseFrontmatter(useDocStore.getState().draft);
    setText(
      Object.keys(frontmatter).length === 0
        ? ''
        : dump(frontmatter, { lineWidth: 100, noRefs: true }).trimEnd(),
    );
    setError(null);
  }, [documentKey]);

  const commit = (value: string) => {
    setText(value);

    const { content } = parseFrontmatter(draft);
    const candidate = value.trim() ? `---\n${value.trim()}\n---\n\n${content}` : content;
    const parsed = parseFrontmatter(candidate);

    if (value.trim() && parsed.error) {
      setError(parsed.error);
      return;
    }

    setError(null);
    setDraft(serializeDocument(parsed.frontmatter, parsed.content));
  };

  const { frontmatter } = parseFrontmatter(draft);
  const summary = Object.keys(frontmatter);

  return (
    <section className="frontmatter">
      <button
        type="button"
        className="frontmatter__toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className={expanded ? 'chevron is-open' : 'chevron'} aria-hidden="true">
          ▶
        </span>
        Propriétés
        {!expanded && summary.length > 0 && (
          <span className="frontmatter__summary">{summary.join(', ')}</span>
        )}
      </button>

      {expanded && (
        <div className="frontmatter__body">
          <textarea
            className="frontmatter__input"
            value={text}
            spellCheck={false}
            rows={Math.max(3, text.split('\n').length)}
            onChange={(event) => commit(event.target.value)}
            placeholder={'title: Ma page\ntags: [doc]'}
          />
          {error && <p className="frontmatter__error">YAML invalide : {error}</p>}
        </div>
      )}
    </section>
  );
}
