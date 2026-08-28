import { useDocStore } from '../store/DocStore';

/**
 * Onglets des workspaces ouverts.
 *
 * Un workspace `unavailable` reste affiché, barré : son dossier peut être sur
 * un disque débranché. Le faire disparaître donnerait l'impression que le
 * travail a été perdu.
 */
export function WorkspaceTabs() {
  const workspaces = useDocStore((state) => state.workspaces);
  const activeId = useDocStore((state) => state.activeWorkspaceId);
  const setActive = useDocStore((state) => state.setActiveWorkspace);
  const remove = useDocStore((state) => state.removeWorkspace);
  const add = useDocStore((state) => state.addLocalWorkspace);

  return (
    <nav className="workspace-tabs" aria-label="Workspaces">
      {workspaces.map((workspace) => (
        <div
          key={workspace.id}
          className={[
            'workspace-tab',
            workspace.id === activeId ? 'is-active' : '',
            workspace.status === 'unavailable' ? 'is-unavailable' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className="workspace-tab__label"
            onClick={() => setActive(workspace.id)}
            title={workspace.error ?? workspace.location}
          >
            {workspace.name}
            {workspace.status === 'unavailable' && (
              <span className="workspace-tab__badge" aria-label="indisponible">
                !
              </span>
            )}
          </button>
          <button
            type="button"
            className="workspace-tab__close"
            onClick={() => void remove(workspace.id)}
            aria-label={`Fermer ${workspace.name}`}
            title="Fermer ce workspace (les fichiers ne sont pas supprimés)"
          >
            ×
          </button>
        </div>
      ))}

      <button type="button" className="workspace-tabs__add" onClick={() => void add()}>
        + Nouveau workspace
      </button>
    </nav>
  );
}
