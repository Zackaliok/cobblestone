import type { BlockTool, BlockToolConstructorOptions } from '@editorjs/editorjs';

import { mermaidFenceSource } from '../../core/parser/MDXEditorConverter';
import { errorMessage, renderMermaid } from '../mermaid';

const svg = (path: string): string =>
  `<svg width="17" height="15" viewBox="0 0 17 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const ICON_CODE = svg('<path d="M5.5 3 1.5 7.5 5.5 12M11.5 3l4 4.5-4 4.5"/>');
const ICON_CHEVRON = svg('<path d="M4 5.5 8.5 10l4.5-4.5"/>');
const ICON_DIAGRAM = svg('<rect x="1.5" y="1.5" width="5" height="4" rx="1"/><rect x="10.5" y="9.5" width="5" height="4" rx="1"/><path d="M4 5.5v5.5h6.5"/>');
const ICON_TABLE = svg('<rect x="1.5" y="2.5" width="14" height="10" rx="1"/><path d="M1.5 6h14M6.5 6v6.5"/>');

/**
 * Bloc Editor.js pour du MDX brut.
 *
 * C'est la soupape du convertisseur : tout ce que le modèle de blocs ne sait
 * pas représenter fidèlement — JSX (`<Callout>`), tableaux, blocs de code avec
 * langage, listes imbriquées — atterrit ici, verbatim.
 *
 * Le tool officiel `@editorjs/code` a été écarté pour cette raison : sa donnée
 * se réduit à `{ code }`, donc le langage d'une fence ```` ```ts ```` serait
 * perdu au premier aller-retour WYSIWYG.
 *
 * Un bloc qui ne contient qu'un diagramme ```` ```mermaid ```` s'affiche rendu,
 * avec une bascule aperçu / code en haut à droite. Sa donnée reste le code.
 */
export class MdxBlockTool implements BlockTool {
  private data: { code: string };
  private readOnly: boolean;
  private wrapper: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private preview: HTMLElement | null = null;
  private viewButtons = new Map<View, HTMLButtonElement>();
  private view: View | null = null;

  /** Source du diagramme Mermaid du bloc, `null` si ce n'en est pas un. */
  private diagram: string | null = null;
  /** Source affichée dans l'aperçu : inutile de recalculer le même SVG. */
  private renderedDiagram: string | null = null;
  /** Ignore les rendus périmés quand le code change pendant le calcul. */
  private generation = 0;

  constructor({ data, readOnly }: BlockToolConstructorOptions<{ code: string }>) {
    this.data = { code: data?.code ?? '' };
    this.readOnly = readOnly ?? false;
  }

  /**
   * Plusieurs entrées dans le menu « / » pour un même tool : la première insère
   * un bloc vide, les suivantes pré-remplissent les composants MDX du projet.
   */
  static get toolbox() {
    return [
      { title: 'MDX brut', icon: ICON_CODE, data: { code: '' } },
      {
        title: 'Accordéon',
        icon: ICON_CHEVRON,
        data: { code: '<Accordion title="Détails">\n  \n</Accordion>' },
      },
      {
        title: 'Bloc de code',
        icon: ICON_CODE,
        data: { code: '```ts\n\n```' },
      },
      {
        title: 'Diagramme Mermaid',
        icon: ICON_DIAGRAM,
        data: { code: '```mermaid\nflowchart LR\n  A[Début] --> B{Choix}\n  B -->|Oui| C[Fin]\n  B -->|Non| A\n```' },
      },
      {
        title: 'Tableau',
        icon: ICON_TABLE,
        data: { code: '| Colonne | Colonne |\n|---|---|\n|  |  |' },
      },
    ];
  }

  static get isReadOnlySupported(): boolean {
    return true;
  }

  /** Sans ça, la touche Entrée créerait un nouveau bloc au lieu d'une ligne. */
  static get enableLineBreaks(): boolean {
    return true;
  }

  render(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'mdx-block';
    // Seule la saisie dans la zone de texte change la donnée du bloc, et
    // Editor.js l'apprend par l'événement `input`. Le reste — hauteur de la
    // zone, bascule aperçu / code, SVG du diagramme — n'est que de l'affichage :
    // sans cet attribut, Editor.js y verrait une modification du document, qui
    // serait resynchronisé (frontmatter resérialisé compris) et marqué modifié.
    wrapper.dataset.mutationFree = 'true';

    const label = document.createElement('span');
    label.className = 'mdx-block__label';
    label.textContent = 'MDX';

    const textarea = document.createElement('textarea');
    textarea.className = 'mdx-block__input';
    textarea.value = this.data.code;
    textarea.spellcheck = false;
    textarea.readOnly = this.readOnly;
    textarea.rows = Math.max(2, this.data.code.split('\n').length);

    const preview = document.createElement('div');
    preview.className = 'mdx-block__preview';

    textarea.addEventListener('input', () => {
      this.fitTextarea();
      this.detectDiagram();
    });
    // Editor.js intercepte certaines touches au niveau du bloc.
    textarea.addEventListener('keydown', (event) => event.stopPropagation());
    // Editor.js place lui-même le curseur dans la zone — insertion depuis le
    // menu « / », flèches du clavier : on montre alors le code qu'on édite.
    textarea.addEventListener('focus', () => this.setView('code'));

    wrapper.append(label, this.renderViewToggle(), textarea, preview);
    this.wrapper = wrapper;
    this.textarea = textarea;
    this.preview = preview;

    this.detectDiagram();
    this.setView(this.diagram === null ? 'code' : 'preview');
    // La zone n'est mesurable qu'une fois le bloc inséré dans la page.
    requestAnimationFrame(() => this.fitTextarea());
    return wrapper;
  }

  save(): { code: string } {
    return { code: this.textarea?.value ?? this.data.code };
  }

  validate(data: { code: string }): boolean {
    return data.code.trim().length > 0;
  }

  destroy(): void {
    this.generation += 1;
  }

  /** Bascule flottante « Aperçu / Code », visible sur les seuls diagrammes. */
  private renderViewToggle(): HTMLElement {
    const toggle = document.createElement('div');
    toggle.className = 'mdx-block__toggle segmented segmented--small';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'Affichage du diagramme');

    for (const [view, label] of VIEWS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.setView(view);
        if (view === 'code') this.textarea?.focus();
      });
      this.viewButtons.set(view, button);
      toggle.append(button);
    }

    // Entrée, Espace et Tab doivent garder leur sens sur un bouton.
    toggle.addEventListener('keydown', (event) => event.stopPropagation());
    return toggle;
  }

  private setView(view: View): void {
    const { wrapper, textarea } = this;
    if (!wrapper || !textarea || view === this.view) return;

    this.view = view;
    wrapper.dataset.view = view;
    for (const [key, button] of this.viewButtons) {
      button.classList.toggle('is-active', key === view);
      button.setAttribute('aria-pressed', String(key === view));
    }

    if (view === 'code') {
      this.fitTextarea();
      return;
    }

    // Le code masqué ne doit plus recevoir la frappe.
    if (document.activeElement === textarea) textarea.blur();
    textarea.style.height = '';
    void this.renderDiagram();
  }

  /**
   * La zone grandit avec le contenu : une barre de défilement interne dans un
   * bloc de quatre lignes serait pénible à éditer.
   */
  private fitTextarea(): void {
    const textarea = this.textarea;
    if (!textarea || this.view !== 'code') return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  private detectDiagram(): void {
    this.diagram = mermaidFenceSource(this.textarea?.value ?? this.data.code);
    this.wrapper?.classList.toggle('mdx-block--mermaid', this.diagram !== null);
  }

  private async renderDiagram(): Promise<void> {
    const { preview, diagram } = this;
    if (!preview || diagram === null || diagram === this.renderedDiagram) return;

    this.renderedDiagram = diagram;
    const generation = ++this.generation;

    if (diagram.trim() === '') {
      this.showPreviewMessage('Diagramme vide.', 'mermaid-diagram__loading');
      return;
    }

    this.showPreviewMessage('Rendu du diagramme…', 'mermaid-diagram__loading');
    try {
      const svg = await renderMermaid(diagram);
      if (generation !== this.generation) return;

      const container = document.createElement('div');
      container.className = 'mermaid-diagram__svg';
      // Le SVG est assaini par Mermaid avant d'être renvoyé (voir `renderMermaid`).
      container.innerHTML = svg;
      preview.replaceChildren(container);
    } catch (cause) {
      if (generation !== this.generation) return;
      this.showPreviewMessage(
        `Diagramme Mermaid invalide : ${errorMessage(cause)}`,
        'mermaid-diagram__error',
      );
    }
  }

  private showPreviewMessage(text: string, className: string): void {
    const message = document.createElement('p');
    message.className = className;
    message.textContent = text;
    this.preview?.replaceChildren(message);
  }
}

type View = 'preview' | 'code';

const VIEWS: ReadonlyArray<readonly [View, string]> = [
  ['preview', 'Aperçu'],
  ['code', 'Code'],
];
