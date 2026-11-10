type Mermaid = typeof import('mermaid').default;

let mermaidPromise: Promise<Mermaid> | null = null;
let renderCount = 0;

/**
 * Mermaid pèse plusieurs mégaoctets : il n'est chargé qu'à l'affichage du
 * premier diagramme, puis partagé par tous les suivants, aperçu et WYSIWYG.
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

/**
 * Rend un diagramme en SVG ; rejette si sa source est invalide. Le SVG est
 * assaini par Mermaid (mode `strict`, DOMPurify) avant d'être renvoyé.
 */
export async function renderMermaid(code: string): Promise<string> {
  // Un identifiant par rendu : le SVG en porte un et y rattache ses styles, et
  // Mermaid supprime du DOM l'élément qui porterait déjà le même.
  const id = `mermaid-${++renderCount}`;
  const mermaid = await loadMermaid();
  try {
    const { svg } = await mermaid.render(id, code);
    return svg;
  } finally {
    // Mermaid laisse parfois un conteneur d'erreur orphelin dans <body>.
    document.getElementById(`d${id}`)?.remove();
  }
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
