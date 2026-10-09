import { lazy, Suspense, useEffect } from 'react';

import { BottomPanel } from './components/BottomPanel';
import { Editor } from './components/Editor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HistoryPanel } from './components/HistoryPanel';
import { ImageViewer } from './components/ImageViewer';
import { RecoveryNotice } from './components/RecoveryNotice';
import { SearchBar } from './components/SearchBar';
import { Sidebar } from './components/Sidebar';
import { UpdateNotice } from './components/UpdateNotice';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { useActiveWorkspace, useIsDirty } from './hooks/useWorkspace';
import { useDocStore, type EditorView } from './store/DocStore';

// Ces deux vues portent les grosses dépendances — le compilateur MDX pour
// l'aperçu, d3-force pour le graphe. Les charger à la demande évite de payer
// leur coût au démarrage, alors qu'on ouvre l'application sur l'éditeur.
const Preview = lazy(() =>
  import('./components/Preview').then((module) => ({ default: module.Preview })),
);
const GraphView = lazy(() =>
  import('./components/GraphView').then((module) => ({ default: module.GraphView })),
);

export function App() {
  const ready = useDocStore((state) => state.ready);
  const initialize = useDocStore((state) => state.initialize);
  const save = useDocStore((state) => state.save);
  const view = useDocStore((state) => state.view);
  const status = useDocStore((state) => state.status);
  const setStatus = useDocStore((state) => state.setStatus);
  const open = useDocStore((state) => state.open);
  const openImage = useDocStore((state) => state.openImage);
  const dirty = useIsDirty();
  const workspace = useActiveWorkspace();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Ctrl+S / Cmd+S : le réflexe de tout le monde, y compris dans un éditeur
  // qui pourrait sauvegarder tout seul.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  // Le message de statut s'efface tout seul, sauf s'il s'agit d'une erreur.
  useEffect(() => {
    if (!status || status.tone === 'error') return;
    const timer = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(timer);
  }, [status, setStatus]);

  if (!ready) {
    return (
      <div className="boot">
        <p>Chargement des workspaces…</p>
      </div>
    );
  }

  const historyAvailable = Boolean(workspace?.gitRoot);

  return (
    <div className="app">
      <header className="app__header">
        <WorkspaceTabs />
      </header>

      <div className="app__body">
        <div className="app__sidebar">
          <SearchBar />
          <Sidebar />
        </div>

        <main className="app__main">
          <div className="app__toolbar">
            <nav className="view-tabs" aria-label="Mode d'affichage">
              <ViewTab id="wysiwyg" label="WYSIWYG" />
              <ViewTab id="source" label="Source" />
              <ViewTab id="preview" label="Aperçu" />
              <ViewTab id="graph" label="Graph" />
              {historyAvailable && <ViewTab id="history" label="Historique" />}
            </nav>

            <div className="app__toolbar-right">
              {open && (
                <span className="app__path" title={open.path}>
                  {open.path}
                  {dirty && <span className="app__dirty" title="Modifications non enregistrées" />}
                </span>
              )}
              <button
                type="button"
                className="button button--primary"
                onClick={() => void save()}
                disabled={!dirty}
              >
                Enregistrer
              </button>
            </div>
          </div>

          <div className="app__view">
            <ErrorBoundary
              scope="view"
              resetKey={`${view}:${open?.workspaceId}:${open?.path}:${openImage?.path}`}
            >
              {openImage ? (
                // Clé par image : changer d'image repart de l'ajustement à la fenêtre.
                <ImageViewer key={`${openImage.workspaceId}::${openImage.path}`} />
              ) : (
                <Suspense fallback={<div className="boot">Chargement de la vue…</div>}>
                  {view === 'wysiwyg' && <Editor mode="wysiwyg" />}
                  {view === 'source' && <Editor mode="source" />}
                  {view === 'preview' && <Preview />}
                  {view === 'graph' && <GraphView />}
                  {view === 'history' && <HistoryPanel />}
                </Suspense>
              )}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <BottomPanel />

      <UpdateNotice />
      <RecoveryNotice />

      {status && (
        <div className={`toast toast--${status.tone}`} role="status">
          {status.text}
          <button type="button" onClick={() => setStatus(null)} aria-label="Fermer">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function ViewTab({ id, label }: { id: EditorView; label: string }) {
  // Pendant l'affichage d'une image, aucun onglet n'est actif : en cliquer un
  // ferme l'image et revient au document.
  const active = useDocStore((state) => state.view === id && !state.openImage);
  const setView = useDocStore((state) => state.setView);

  return (
    <button
      type="button"
      className={active ? 'is-active' : ''}
      onClick={() => setView(id)}
      aria-current={active}
    >
      {label}
    </button>
  );
}
