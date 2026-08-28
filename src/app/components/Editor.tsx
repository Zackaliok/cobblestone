import EditorJS, { type OutputData } from '@editorjs/editorjs';
import Delimiter from '@editorjs/delimiter';
import Header from '@editorjs/header';
import InlineCode from '@editorjs/inline-code';
import List from '@editorjs/list';
import Marker from '@editorjs/marker';
import Quote from '@editorjs/quote';
import { useEffect, useRef, useState } from 'react';

import {
  blocksToMdx,
  mdxToBlocks,
  type EditorBlock,
} from '../../core/parser/MDXEditorConverter';
import { parseFrontmatter, serializeDocument } from '../../core/parser/MDXParser';
import { MdxBlockTool } from '../editor/MdxBlockTool';
import { useDocStore } from '../store/DocStore';
import { FrontmatterPanel } from './FrontmatterPanel';
import { SourceEditor } from './SourceEditor';

const SYNC_DELAY_MS = 300;

/**
 * Éditeur double mode.
 *
 * En WYSIWYG, seul le *corps* du document passe par Editor.js : le frontmatter
 * est édité à part et réattaché à chaque synchronisation. Le faire transiter
 * par les blocs le transformerait en paragraphes et détruirait le YAML.
 */
export function Editor({ mode }: { mode: 'wysiwyg' | 'source' }) {
  if (mode === 'source') return <SourceEditor />;
  return <WysiwygEditor />;
}

function WysiwygEditor() {
  const open = useDocStore((state) => state.open);
  const setDraft = useDocStore((state) => state.setDraft);

  const holderRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorJS | null>(null);
  const timerRef = useRef<number | null>(null);

  const documentKey = open ? `${open.workspaceId}::${open.path}` : null;
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !documentKey) return;

    // Le brouillon est lu au montage seulement : ensuite, c'est Editor.js qui
    // fait autorité sur le corps du document, pas l'inverse.
    const initial = useDocStore.getState().draft;

    // Chaque montage reçoit son propre conteneur. `destroy()` étant asynchrone,
    // un nettoyage qui viderait le hôte partagé s'exécuterait *après* le
    // remontage de StrictMode et effacerait l'éditeur qui vient d'être créé.
    const container = document.createElement('div');
    holder.append(container);

    const editor = new EditorJS({
      holder: container,
      autofocus: false,
      placeholder: 'Écrivez, ou tapez « / » pour insérer un bloc…',
      tools: {
        header: {
          class: Header as never,
          inlineToolbar: true,
          config: { levels: [1, 2, 3, 4], defaultLevel: 2 },
        },
        list: { class: List as never, inlineToolbar: true },
        quote: { class: Quote as never, inlineToolbar: true },
        delimiter: { class: Delimiter as never },
        marker: { class: Marker as never },
        inlineCode: { class: InlineCode as never },
        mdx: { class: MdxBlockTool as never },
      },
      data: toEditorData(initial),
      onChange: () => scheduleSync(),
    });

    editorRef.current = editor;

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void editor.isReady
        .then(() => editor.destroy())
        .catch(() => {
          // L'éditeur peut être détruit avant d'être prêt si l'on change vite
          // de document : rien d'utile à remonter ici.
        })
        .finally(() => {
          container.remove();
        });
      editorRef.current = null;
    };
    // Changer de document reconstruit l'éditeur : plus fiable qu'un `render()`
    // partiel, qui laisse parfois des blocs fantômes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey]);

  function scheduleSync() {
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      const editor = editorRef.current;
      if (!editor) return;

      void editor
        .save()
        .then((output: OutputData) => {
          // Le frontmatter est relu à chaud : le panneau Propriétés peut avoir
          // été modifié pendant la frappe.
          const { frontmatter } = parseFrontmatter(useDocStore.getState().draft);
          const body = blocksToMdx(output.blocks as unknown as EditorBlock[]);
          setDraft(serializeDocument(frontmatter, body));
          setFailure(null);
        })
        .catch((error: unknown) => {
          setFailure(error instanceof Error ? error.message : String(error));
        });
    }, SYNC_DELAY_MS);
  }

  if (!open) return <EmptyState />;

  return (
    <div className="editor">
      <FrontmatterPanel />
      {failure && <p className="editor__error">Synchronisation impossible : {failure}</p>}
      <div className="editor__surface" ref={holderRef} />
    </div>
  );
}

function toEditorData(raw: string): OutputData {
  const { content } = parseFrontmatter(raw);
  const blocks = mdxToBlocks(content);
  return { blocks: blocks as unknown as OutputData['blocks'] };
}

export function EmptyState() {
  return (
    <div className="empty-state">
      <h2>Aucun document ouvert</h2>
      <p>Choisissez un fichier dans la barre latérale, ou créez-en un nouveau.</p>
    </div>
  );
}
