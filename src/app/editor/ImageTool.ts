import type { BlockTool, BlockToolConstructorOptions } from '@editorjs/editorjs';

import { loadWorkspaceImage } from '../images';

const ICON_IMAGE =
  '<svg width="17" height="15" viewBox="0 0 17 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="1.5" y="1.5" width="14" height="12" rx="1.5"/><circle cx="5.5" cy="5.5" r="1.3"/><path d="m2 12 4-4 3 3 2-2 4 4"/></svg>';

export interface ImageData {
  src: string;
  alt: string;
}

export interface ImageToolConfig {
  /**
   * Fichier du workspace désigné par `src` (relatif à la note ouverte), ou
   * `null` si ce n'est pas une image du workspace (URL, chemin hors racine).
   */
  resolve(src: string): { workspaceId: string; path: string } | null;
}

/** Délai avant de recharger l'aperçu quand on tape un chemin. */
const RELOAD_DELAY_MS = 400;

/**
 * Bloc image du WYSIWYG : `![texte alternatif](chemin)` seul sur sa ligne.
 *
 * L'image est affichée depuis le workspace ; le chemin et le texte alternatif
 * restent éditables sous l'aperçu. Le fichier image lui-même n'est jamais
 * modifié : le bloc ne fait que l'afficher.
 */
export class ImageTool implements BlockTool {
  private data: ImageData;
  private readOnly: boolean;
  private config: ImageToolConfig | undefined;

  private preview: HTMLElement | null = null;
  private srcInput: HTMLInputElement | null = null;
  private altInput: HTMLInputElement | null = null;
  private objectUrl: string | null = null;
  private reloadTimer: number | null = null;
  /** Ignore les chargements périmés quand le chemin change pendant la lecture. */
  private generation = 0;

  constructor({ data, readOnly, config }: BlockToolConstructorOptions<Partial<ImageData>, ImageToolConfig>) {
    this.data = { src: data?.src ?? '', alt: data?.alt ?? '' };
    this.readOnly = readOnly ?? false;
    this.config = config;
  }

  static get toolbox() {
    return { title: 'Image', icon: ICON_IMAGE };
  }

  static get isReadOnlySupported(): boolean {
    return true;
  }

  render(): HTMLElement {
    const wrapper = document.createElement('figure');
    wrapper.className = 'image-block';

    const preview = document.createElement('div');
    preview.className = 'image-block__preview';

    const fields = document.createElement('figcaption');
    fields.className = 'image-block__fields';

    const alt = this.input('Texte alternatif', this.data.alt, 'image-block__alt');
    const src = this.input('chemin/vers/image.png', this.data.src, 'image-block__src');
    src.addEventListener('input', () => this.scheduleReload());

    fields.append(alt, src);
    wrapper.append(preview, fields);

    this.preview = preview;
    this.altInput = alt;
    this.srcInput = src;
    this.reload();
    return wrapper;
  }

  save(): ImageData {
    return {
      src: this.srcInput?.value.trim() ?? this.data.src,
      alt: this.altInput?.value ?? this.data.alt,
    };
  }

  destroy(): void {
    if (this.reloadTimer) window.clearTimeout(this.reloadTimer);
    this.releaseUrl();
  }

  private input(placeholder: string, value: string, className: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = className;
    input.placeholder = placeholder;
    input.value = value;
    input.spellcheck = false;
    input.readOnly = this.readOnly;
    // Editor.js intercepte certaines touches (Entrée, Retour arrière) au niveau
    // du bloc : dans un champ, elles doivent garder leur sens habituel.
    input.addEventListener('keydown', (event) => event.stopPropagation());
    // Editor.js ne détecte les changements que par MutationObserver : taper
    // dans un <input> ne modifie pas le DOM, on reflète donc la valeur.
    input.addEventListener('input', () => input.setAttribute('value', input.value));
    return input;
  }

  private scheduleReload(): void {
    if (this.reloadTimer) window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(() => this.reload(), RELOAD_DELAY_MS);
  }

  private reload(): void {
    const preview = this.preview;
    if (!preview) return;

    const src = this.srcInput?.value.trim() ?? this.data.src;
    const generation = ++this.generation;

    if (!src) {
      this.showMessage('Indiquez le chemin d’une image du workspace (.png, .jpg, .jpeg).');
      return;
    }
    if (!this.config) {
      this.showMessage('Aperçu indisponible.');
      return;
    }

    const file = this.config.resolve(src);
    if (!file) {
      this.showMessage('Seules les images du workspace sont affichées.');
      return;
    }

    this.showMessage('Chargement…');
    loadWorkspaceImage(file.workspaceId, file.path)
      .then((image) => {
        if (generation !== this.generation) {
          URL.revokeObjectURL(image.url);
          return;
        }
        this.releaseUrl();
        this.objectUrl = image.url;

        const img = document.createElement('img');
        img.src = image.url;
        img.alt = this.altInput?.value ?? '';
        preview.replaceChildren(img);
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) return;
        this.showMessage(
          `Image introuvable : ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  private showMessage(text: string): void {
    const message = document.createElement('p');
    message.className = 'image-block__message';
    message.textContent = text;
    this.preview?.replaceChildren(message);
    this.releaseUrl();
  }

  private releaseUrl(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}
