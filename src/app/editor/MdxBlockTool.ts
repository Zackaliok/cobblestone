import type { BlockTool, BlockToolConstructorOptions } from '@editorjs/editorjs';

const svg = (path: string): string =>
  `<svg width="17" height="15" viewBox="0 0 17 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const ICON_CODE = svg('<path d="M5.5 3 1.5 7.5 5.5 12M11.5 3l4 4.5-4 4.5"/>');
const ICON_INFO = svg('<circle cx="8.5" cy="7.5" r="6"/><path d="M8.5 7v4M8.5 4.6v.1"/>');
const ICON_WARNING = svg('<path d="M8.5 1.5 15.5 13.5h-14z"/><path d="M8.5 6v3.2M8.5 11.4v.1"/>');
const ICON_CHEVRON = svg('<path d="M4 5.5 8.5 10l4.5-4.5"/>');
const ICON_TOGGLE = svg('<rect x="1.5" y="4" width="14" height="7" rx="3.5"/><circle cx="11.5" cy="7.5" r="1.8"/>');
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
 */
export class MdxBlockTool implements BlockTool {
  private data: { code: string };
  private readOnly: boolean;
  private textarea: HTMLTextAreaElement | null = null;

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
        title: 'Callout info',
        icon: ICON_INFO,
        data: { code: '<Callout type="info">\n  \n</Callout>' },
      },
      {
        title: 'Callout avertissement',
        icon: ICON_WARNING,
        data: { code: '<Callout type="warning">\n  \n</Callout>' },
      },
      {
        title: 'Accordéon',
        icon: ICON_CHEVRON,
        data: { code: '<Accordion title="Détails">\n  \n</Accordion>' },
      },
      {
        title: 'Toggle',
        icon: ICON_TOGGLE,
        data: { code: '<Toggle label="Activé" defaultOn />' },
      },
      {
        title: 'Bloc de code',
        icon: ICON_CODE,
        data: { code: '```ts\n\n```' },
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

    const label = document.createElement('span');
    label.className = 'mdx-block__label';
    label.textContent = 'MDX';
    wrapper.append(label);

    const textarea = document.createElement('textarea');
    textarea.className = 'mdx-block__input';
    textarea.value = this.data.code;
    textarea.spellcheck = false;
    textarea.readOnly = this.readOnly;
    textarea.rows = Math.max(2, this.data.code.split('\n').length);

    // La zone grandit avec le contenu : une barre de défilement interne dans un
    // bloc de quatre lignes serait pénible à éditer.
    const autoSize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };

    textarea.addEventListener('input', autoSize);
    // Editor.js intercepte certaines touches au niveau du bloc.
    textarea.addEventListener('keydown', (event) => event.stopPropagation());
    requestAnimationFrame(autoSize);

    wrapper.append(textarea);
    this.textarea = textarea;
    return wrapper;
  }

  save(): { code: string } {
    return { code: this.textarea?.value ?? this.data.code };
  }

  validate(data: { code: string }): boolean {
    return data.code.trim().length > 0;
  }
}
