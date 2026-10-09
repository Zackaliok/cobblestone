import type { BlockTool, BlockToolConstructorOptions } from '@editorjs/editorjs';

import { CALLOUT_TYPES, type CalloutType } from '../../core/parser/MDXEditorConverter';

interface CalloutData {
  type: CalloutType;
  text: string;
}

/** Mêmes pictogrammes et libellés que le rendu de l'aperçu (Preview.tsx). */
export const CALLOUT_META: Record<CalloutType, { icon: string; label: string }> = {
  info: { icon: 'ℹ', label: 'Info' },
  warning: { icon: '⚠', label: 'Avertissement' },
  danger: { icon: '⛔', label: 'Danger' },
  success: { icon: '✓', label: 'Succès' },
};

const toolboxIcon = (type: CalloutType): string =>
  `<span class="callout-tool-icon callout-tool-icon--${type}">${CALLOUT_META[type].icon}</span>`;

const isCalloutType = (value: unknown): value is CalloutType =>
  CALLOUT_TYPES.includes(value as CalloutType);

/**
 * Bloc Editor.js pour `<Callout type="…">`.
 *
 * Le callout est affiché avec son rendu final et son corps reste éditable,
 * au lieu d'exposer les balises JSX dans un bloc MDX brut. Le type se change
 * via le menu du bloc (⋮). Seuls les callouts de forme simple arrivent ici ;
 * les autres restent en MDX brut (voir `parseSimpleCallout`).
 */
export class CalloutTool implements BlockTool {
  private data: CalloutData;
  private readOnly: boolean;
  private wrapper: HTMLElement | null = null;
  private icon: HTMLElement | null = null;
  private body: HTMLElement | null = null;

  constructor({ data, readOnly }: BlockToolConstructorOptions<CalloutData>) {
    this.data = {
      type: isCalloutType(data?.type) ? data.type : 'info',
      text: data?.text ?? '',
    };
    this.readOnly = readOnly ?? false;
  }

  /** Une entrée du menu « / » par type de callout. */
  static get toolbox() {
    return CALLOUT_TYPES.map((type) => ({
      title: `Callout ${CALLOUT_META[type].label.toLowerCase()}`,
      icon: toolboxIcon(type),
      data: { type, text: '' },
    }));
  }

  static get isReadOnlySupported(): boolean {
    return true;
  }

  /** Entrée insère un retour à la ligne dans le callout plutôt qu'un bloc. */
  static get enableLineBreaks(): boolean {
    return true;
  }

  static get sanitize() {
    return {
      text: {
        br: true,
        b: true,
        i: true,
        mark: true,
        a: { href: true },
        code: { class: true },
      },
    };
  }

  render(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = `callout callout--${this.data.type} callout-block`;

    const icon = document.createElement('span');
    icon.className = 'callout__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = CALLOUT_META[this.data.type].icon;

    const body = document.createElement('div');
    body.className = 'callout__body callout-block__body';
    body.contentEditable = String(!this.readOnly);
    body.dataset.placeholder = 'Écrivez votre note…';
    body.innerHTML = this.data.text;

    wrapper.append(icon, body);
    this.wrapper = wrapper;
    this.icon = icon;
    this.body = body;
    return wrapper;
  }

  renderSettings() {
    return CALLOUT_TYPES.map((type) => ({
      icon: toolboxIcon(type),
      label: CALLOUT_META[type].label,
      isActive: this.data.type === type,
      closeOnActivate: true,
      onActivate: () => this.setType(type),
    }));
  }

  save(): CalloutData {
    return { type: this.data.type, text: this.body?.innerHTML ?? this.data.text };
  }

  validate(): boolean {
    return true;
  }

  private setType(type: CalloutType): void {
    this.data.type = type;
    if (this.wrapper) {
      this.wrapper.className = `callout callout--${type} callout-block`;
    }
    if (this.icon) this.icon.textContent = CALLOUT_META[type].icon;
  }
}
