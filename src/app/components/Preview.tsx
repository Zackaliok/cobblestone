import { evaluate, type EvaluateOptions } from '@mdx-js/mdx';
import { gemoji } from 'gemoji';
import type { MDXComponents } from 'mdx/types';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import * as runtime from 'react/jsx-runtime';
import rehypeHighlight from 'rehype-highlight';
import { defListHastHandlers, remarkDefinitionList } from 'remark-definition-list';
import remarkGfm from 'remark-gfm';

import { buildShortcodeIndex, remarkEmojiShortcodes } from '../../core/emoji/emoji';
import {
  escapeHeadingIds,
  rehypeTaskListIndex,
  remarkExtendedMarkdown,
  setTaskChecked,
} from '../../core/parser/extendedMarkdown';
import { buildCodeMask, parseFrontmatter, slugifyHeading } from '../../core/parser/MDXParser';
import { useDocStore } from '../store/DocStore';
import { EmptyState } from './Editor';

const COMPILE_DELAY_MS = 300;

/** `:rocket:` -> 🚀, avec les noms courts de GitHub. */
const remarkEmoji = remarkEmojiShortcodes(buildShortcodeIndex(gemoji));

/**
 * Syntaxe Markdown étendue (voir `core/parser/extendedMarkdown.ts`).
 * `singleTilde: false` : un tilde simple sert à l'indice (`H~2~O`), seul le
 * double tilde barre le texte.
 */
const COMPILE_OPTIONS = {
  remarkPlugins: [
    [remarkGfm, { singleTilde: false }],
    remarkDefinitionList,
    remarkExtendedMarkdown,
    remarkEmoji,
  ],
  rehypePlugins: [[rehypeHighlight, { detect: false }], rehypeTaskListIndex],
  remarkRehypeOptions: {
    handlers: defListHastHandlers,
    footnoteLabel: 'Notes',
    footnoteBackLabel: 'Revenir au texte',
  },
} as Partial<EvaluateOptions>;

/**
 * Aperçu rendu du document courant.
 *
 * Le MDX est compilé **dans la webview**, ce qui impose `'unsafe-eval'` dans la
 * CSP (voir `tauri.conf.json`) : `@mdx-js/mdx` construit le composant via
 * `new Function`. Acceptable pour de la doc locale ou interne ; à revoir si un
 * jour du MDX non fiable doit être affiché — il faudrait alors le pré-compiler
 * en amont.
 */
export function Preview() {
  const open = useDocStore((state) => state.open);
  const draft = useDocStore((state) => state.draft);

  const [content, setContent] = useState<ReactNode>(null);
  const [error, setError] = useState<string | null>(null);

  const components = useMDXComponentMap();
  const source = useMemo(() => {
    const { content: body } = parseFrontmatter(draft);
    return replaceWikiLinks(escapeHeadingIds(body));
  }, [draft]);

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(() => {
      evaluate(source, { ...runtime, ...COMPILE_OPTIONS, baseUrl: import.meta.url } as never)
        .then((module) => {
          if (cancelled) return;
          const Content = module.default as (props: {
            components: MDXComponents;
          }) => ReactNode;
          setContent(<Content components={components} />);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          // Une erreur de compilation est l'état normal pendant la frappe :
          // on garde le dernier rendu valide et on affiche le message.
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    }, COMPILE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, components]);

  if (!open) return <EmptyState />;

  return (
    <div className="preview">
      {error && <pre className="preview__error">{error}</pre>}
      <article className="preview__content markdown">{content}</article>
    </div>
  );
}

/**
 * Transforme `[[cible|libellé]]` en `<WikiLink … />` avant compilation.
 *
 * Les occurrences situées dans du code sont laissées intactes : une page qui
 * documente la syntaxe des wiki-links doit pouvoir l'écrire sans la déclencher.
 */
export function replaceWikiLinks(source: string): string {
  const mask = buildCodeMask(source);
  const pattern = /\[\[([^\][\n]+)\]\]/g;

  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    if (mask[match.index]) continue;

    const inner = match[1]!;
    const pipe = inner.indexOf('|');
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const label = pipe === -1 ? target : inner.slice(pipe + 1).trim();

    result += source.slice(cursor, match.index);
    result += `<WikiLink target="${escapeAttribute(target)}" label="${escapeAttribute(label)}" />`;
    cursor = match.index + match[0].length;
  }

  return result + source.slice(cursor);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function useMDXComponentMap(): MDXComponents {
  const open = useDocStore((state) => state.open);
  const followLink = useDocStore((state) => state.followLink);

  return useMemo<MDXComponents>(
    () => ({
      WikiLink: ({ target, label }: { target: string; label?: string }) => (
        <button
          type="button"
          className="wiki-link"
          onClick={() => {
            if (!open) return;
            void followLink(
              { raw: `[[${target}]]`, ...parseTarget(target), offset: 0 },
              open.workspaceId,
            );
          }}
        >
          {label ?? target}
        </button>
      ),

      Callout: ({ type = 'info', children }: { type?: string; children?: ReactNode }) => (
        <aside className={`callout callout--${type}`}>
          <span className="callout__icon" aria-hidden="true">
            {type === 'warning' ? '⚠' : type === 'danger' ? '⛔' : type === 'success' ? '✓' : 'ℹ'}
          </span>
          <div className="callout__body">{children}</div>
        </aside>
      ),

      Accordion: ({ title, children }: { title?: string; children?: ReactNode }) => (
        <details className="accordion">
          <summary>{title ?? 'Détails'}</summary>
          <div className="accordion__body">{children}</div>
        </details>
      ),

      Toggle: ({ label, defaultOn }: { label?: string; defaultOn?: boolean }) => (
        <label className="toggle">
          <input type="checkbox" defaultChecked={Boolean(defaultOn)} />
          <span>{label ?? 'Activé'}</span>
        </label>
      ),

      a: ({ href, children, ...props }: ComponentProps<'a'>) => (
        <a
          {...props}
          href={href}
          onClick={(event) => {
            event.preventDefault();
            if (!href) return;
            // Ancre interne (notes de bas de page, `{#id}`) : on défile dans
            // l'aperçu. Tout autre lien ne doit pas naviguer *dans* la webview,
            // ce qui remplacerait l'application par la page distante.
            if (href.startsWith('#')) {
              document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();
            } else {
              void openExternal(href);
            }
          }}
        >
          {children}
        </a>
      ),

      // Cases des listes de tâches, numérotées par `rehypeTaskListIndex`.
      input: (props: ComponentProps<'input'> & { 'data-task-index'?: string }) => {
        const index = Number(props['data-task-index']);
        if (props.type !== 'checkbox' || Number.isNaN(index)) return <input {...props} />;
        return (
          <TaskCheckbox
            checked={Boolean(props.checked)}
            onChange={(checked) => rewriteBody((body) => setTaskChecked(body, index, checked))}
          />
        );
      },

      h1: (props: HeadingProps) => headingWithAnchor('h1', props),
      h2: (props: HeadingProps) => headingWithAnchor('h2', props),
      h3: (props: HeadingProps) => headingWithAnchor('h3', props),
      h4: (props: HeadingProps) => headingWithAnchor('h4', props),
    }),
    [open, followLink],
  );
}

/**
 * Case d'une liste de tâches `- [ ]`. Contrôlée localement : la source n'est
 * recompilée qu'après un délai, la case doit refléter le clic tout de suite.
 */
function TaskCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [value, setValue] = useState(checked);
  useEffect(() => setValue(checked), [checked]);

  return (
    <input
      type="checkbox"
      className="task-checkbox"
      checked={value}
      onChange={(event) => {
        setValue(event.target.checked);
        onChange(event.target.checked);
      }}
    />
  );
}

/**
 * Applique une modification au corps du brouillon. Le document devient
 * « modifié » comme après n'importe quelle édition : Ctrl+S l'écrit sur le
 * disque.
 */
function rewriteBody(transform: (body: string) => string): void {
  const { draft, setDraft } = useDocStore.getState();
  const { content } = parseFrontmatter(draft);
  // Le frontmatter est recopié à l'octet près : le resérialiser pourrait
  // reformater le YAML alors qu'on ne touche qu'à une case.
  const prefix = draft.slice(0, draft.length - content.length);
  setDraft(prefix + transform(content));
}

type HeadingProps = { id?: string; children?: ReactNode };

/** Un identifiant explicite (`## Titre {#ancre}`) l'emporte sur l'ancre dérivée. */
function headingWithAnchor(tag: 'h1' | 'h2' | 'h3' | 'h4', { id, children }: HeadingProps): ReactNode {
  const anchor = id ?? slugifyHeading(typeof children === 'string' ? children : '');
  const Tag = tag;
  return <Tag id={anchor || undefined}>{children}</Tag>;
}

function parseTarget(target: string): { workspaceHint?: string; target: string } {
  const colon = target.indexOf(':');
  if (colon === -1) return { target };
  return {
    workspaceHint: target.slice(0, colon).trim(),
    target: target.slice(colon + 1).replace(/:/g, '/'),
  };
}

async function openExternal(href: string): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(href);
  } catch {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}
