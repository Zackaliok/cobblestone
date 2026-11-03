import { useEffect, useState } from 'react';

import { errorMessage, renderMermaid } from '../mermaid';

/** Diagramme Mermaid, rendu depuis un bloc ```` ```mermaid ````. */
export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    renderMermaid(code)
      .then((result) => {
        if (cancelled) return;
        setSvg(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // En cours de frappe, le diagramme est souvent invalide : l'erreur est
        // affichée à sa place, sans faire échouer le reste de l'aperçu.
        setError(errorMessage(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <figure className="mermaid-diagram">
      {svg ? (
        // Le SVG est assaini par Mermaid avant d'être renvoyé (voir `renderMermaid`).
        <div className="mermaid-diagram__svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        !error && <p className="mermaid-diagram__loading">Rendu du diagramme…</p>
      )}
      {error && (
        <figcaption className="mermaid-diagram__error">
          Diagramme Mermaid invalide : {error}
        </figcaption>
      )}
    </figure>
  );
}
