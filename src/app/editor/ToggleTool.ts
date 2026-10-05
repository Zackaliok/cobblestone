import type { BlockTool, BlockToolConstructorOptions } from '@editorjs/editorjs';

import { DEFAULT_TOGGLE_LABEL, type ToggleData } from '../../core/parser/toggles';

const ICON_CHECKBOX =
  '<svg width="17" height="15" viewBox="0 0 17 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="1.5" width="12" height="12" rx="2"/><path d="M5 7.5 7.3 10 11.5 5"/></svg>';

/**
 * Case à cocher `<Toggle>` affichée comme telle dans le WYSIWYG, au lieu d'un
 * bloc MDX brut. Le libellé est du texte simple : le composant le reçoit en
 * attribut, où un balisage inline n'aurait pas de sens.
 */
export class ToggleTool implements BlockTool {
  private data: ToggleData;
  private readOnly: boolean;
  private checkbox: HTMLInputElement | null = null;
  private label: HTMLElement | null = null;

  constructor({ data, readOnly }: BlockToolConstructorOptions<Partial<ToggleData>>) {
    this.data = {
      label: data?.label ?? DEFAULT_TOGGLE_LABEL,
      // Une nouvelle case part décochée : c'est l'état attendu d'une checklist.
      checked: data?.checked ?? false,
    };
    this.readOnly = readOnly ?? false;
  }

  static get toolbox() {
    return { title: 'Case à cocher', icon: ICON_CHECKBOX };
  }

  static get isReadOnlySupported(): boolean {
    return true;
  }

  render(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'toggle-block';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'toggle-block__checkbox';
    checkbox.checked = this.data.checked;
    checkbox.disabled = this.readOnly;
    checkbox.setAttribute('aria-label', 'Cocher');
    // Cocher un <input> ne modifie pas le DOM, or Editor.js ne détecte les
    // changements que par MutationObserver : sans cet attribut reflété,
    // `onChange` ne partirait pas et la case ne serait jamais enregistrée.
    checkbox.addEventListener('change', () => {
      wrapper.dataset.checked = String(checkbox.checked);
    });

    const label = document.createElement('div');
    label.className = 'toggle-block__label';
    label.contentEditable = String(!this.readOnly);
    label.textContent = this.data.label;
    label.dataset.placeholder = 'Libellé';
    // Le libellé finit dans un attribut JSX : on colle du texte brut sur une ligne.
    label.addEventListener('paste', (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain').replace(/\s+/g, ' ') ?? '';
      document.execCommand('insertText', false, text);
    });

    wrapper.dataset.checked = String(this.data.checked);
    wrapper.append(checkbox, label);

    this.checkbox = checkbox;
    this.label = label;
    return wrapper;
  }

  save(): ToggleData {
    return {
      label: (this.label?.textContent ?? this.data.label).replace(/\s+/g, ' ').trim(),
      checked: this.checkbox?.checked ?? this.data.checked,
    };
  }
}
