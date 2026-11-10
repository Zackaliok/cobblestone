import type { API, BlockTool, BlockToolConstructorOptions, PasteEvent } from '@editorjs/editorjs';
import type { MenuConfig } from '@editorjs/editorjs/types/tools';
import Table from '@editorjs/table';

import type { TableAlign, TableData } from '../../core/parser/MDXEditorConverter';

type MenuItems = Extract<MenuConfig, unknown[]>;

/**
 * Ce que l'on utilise du tool officiel. Ses déclarations TypeScript ne
 * correspondent pas au code (`save()` y renverrait `{ rows, cols }`) : on s'en
 * tient à ce contrat-ci, vérifié sur la version installée.
 */
interface OfficialTable {
  data: { withHeadings: boolean };
  /** Grille interne, recréée à chaque `render()`. */
  table: { table: HTMLElement } | null;
  render(): HTMLElement;
  renderSettings(): MenuItems;
  onPaste(event: PasteEvent): void;
  destroy(): void;
}

const OfficialTable = Table as unknown as new (
  options: BlockToolConstructorOptions<Partial<TableData>>,
) => OfficialTable;

const ALIGNS: ReadonlyArray<NonNullable<TableAlign>> = ['left', 'center', 'right'];

/**
 * Bloc tableau du WYSIWYG, façon Notion : cellules éditables, boutons « + »
 * pour ajouter une ligne ou une colonne, menu de ligne et de colonne pour en
 * insérer ou en supprimer.
 *
 * L'édition elle-même est celle de `@editorjs/table` ; ce tool l'enveloppe
 * pour porter ce que le Markdown exige en plus :
 *
 * - l'**alignement** des colonnes (`:---:`), posé en `data-align` sur chaque
 *   cellule : il suit ainsi sa colonne quand on en insère ou en supprime une ;
 * - les **lignes Markdown d'origine**, que le convertisseur réutilise pour
 *   les lignes non modifiées ;
 * - les **lignes vides**, que le tool officiel supprime à l'enregistrement : le
 *   fichier changerait sans que l'on ait touché au tableau.
 *
 * L'option « Étirer » du tool officiel est retirée : le Markdown ne saurait
 * pas l'enregistrer.
 */
export class TableTool implements BlockTool {
  private inner: OfficialTable;
  private api: API;
  private align: TableAlign[];
  private source: string[] | undefined;

  constructor(options: BlockToolConstructorOptions<Partial<TableData>>) {
    const { data, api } = options;
    this.api = api;
    this.align = data?.align ?? [];
    this.source = data?.source;
    // Un tableau Markdown a presque toujours un en-tête : c'est le défaut d'un
    // tableau inséré depuis le menu.
    this.inner = new OfficialTable({
      ...options,
      data: { withHeadings: data?.withHeadings ?? true, content: data?.content ?? [] },
    });
  }

  static get toolbox() {
    return { title: 'Tableau', icon: Table.toolbox.icon };
  }

  static get isReadOnlySupported(): boolean {
    return true;
  }

  /** Entrée passe à la ligne suivante du tableau au lieu de créer un bloc. */
  static get enableLineBreaks(): boolean {
    return true;
  }

  /** Coller un tableau HTML (tableur, page web) crée un bloc tableau. */
  static get pasteConfig() {
    return Table.pasteConfig;
  }

  static get sanitize() {
    return {
      content: {
        br: true,
        b: true,
        i: true,
        mark: true,
        a: { href: true },
        code: { class: true },
      },
      // Markdown brut : le nettoyage HTML le corromprait (`&`, `<Badge />`…).
      source: true,
    };
  }

  render(): HTMLElement {
    const element = this.inner.render();
    this.cells().forEach((row) =>
      row.forEach((cell, column) => {
        const align = this.align[column];
        if (align) cell.dataset.align = align;
      }),
    );
    return element;
  }

  renderSettings(): MenuItems {
    const stretch = [this.api.i18n.t('Stretch'), this.api.i18n.t('Collapse')];
    return this.inner
      .renderSettings()
      .filter((item) => !('label' in item) || !stretch.includes(String(item.label)));
  }

  save(): TableData {
    const cells = this.cells();
    const width = Math.max(0, ...cells.map((row) => row.length));

    return {
      withHeadings: this.inner.data.withHeadings,
      content: cells.map((row) => row.map((cell) => cell.innerHTML)),
      align: Array.from({ length: width }, (_, column) => columnAlign(cells, column)),
      ...(this.source ? { source: this.source } : {}),
    };
  }

  onPaste(event: PasteEvent): void {
    // Le contenu collé remplace tout : rien à reprendre du Markdown d'origine.
    this.align = [];
    this.source = undefined;
    this.inner.onPaste(event);
  }

  destroy(): void {
    this.inner.destroy();
  }

  /** Cellules de la grille, ligne par ligne. */
  private cells(): HTMLElement[][] {
    const grid = this.inner.table?.table;
    if (!grid) return [];
    return Array.from(grid.querySelectorAll<HTMLElement>(':scope > .tc-row'), (row) =>
      Array.from(row.querySelectorAll<HTMLElement>(':scope > .tc-cell')),
    );
  }
}

/**
 * Alignement d'une colonne : celui de la première cellule qui en porte un. Une
 * colonne insérée n'en a aucun ; une ligne ajoutée hérite de ses voisines.
 */
function columnAlign(cells: HTMLElement[][], column: number): TableAlign {
  for (const row of cells) {
    const align = row[column]?.dataset.align;
    const known = ALIGNS.find((value) => value === align);
    if (known) return known;
  }
  return null;
}
