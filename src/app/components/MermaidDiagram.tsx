import { useEffect, useId, useState } from 'react';

type Mermaid = typeof import('mermaid').default;

let mermaidPromise: Promise<Mermaid> | null = null;

/**
 * Mermaid pèse plusieurs mégaoctets : il n'est chargé qu'à l'affichage du
 * premier diagramme, puis partagé par tous les suivants.
 */
function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      // `strict` : pas de HTML ni de clics scriptés dans les libellés. Les
      // diagrammes viennent de la doc, pas de l'application.
      securityLevel: 'strict',
      theme: 'dark',
      themeVariables: {
        background: 'transparent',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      },
    });
    return mermaid;
  });
  return mermaidPromise;
}

/** Diagramme Mermaid, rendu depuis un bloc ```` ```mermaid ````. */
export function MermaidDiagram({ code }: { code: string }) {
  // Mermaid exige un identifiant de DOM valide : `useId` produit des `:`.
  const id = `mermaid-${useId().replace(/[^\w-]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then((result) => {
        if (cancelled) return;
        setSvg(result.svg);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // En cours de frappe, le diagramme est souvent invalide : l'erreur est
        // affichée à sa place, sans faire échouer le reste de l'aperçu.
        setError(cause instanceof Error ? cause.message : String(cause));
        // Mermaid laisse parfois un conteneur d'erreur orphelin dans <body>.
        document.getElementById(`d${id}`)?.remove();
      });

    return () => {
      cancelled = true;
    };
  }, [id, code]);

  return (
    <figure className="mermaid-diagram">
      {svg ? (
        // Le SVG est produit par Mermaid en mode `strict`, qui l'assainit
        // (DOMPurify) avant de le renvoyer.
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
