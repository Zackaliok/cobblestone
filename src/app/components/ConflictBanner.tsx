import { useDocStore } from '../store/DocStore';

/**
 * Affiché quand le fichier ouvert a été modifié par un autre outil alors que
 * le brouillon contient des modifications non enregistrées. Aucune des deux
 * versions n'est sacrifiée tant que l'utilisateur n'a pas choisi.
 */
export function ConflictBanner() {
  const conflict = useDocStore((state) => state.conflict);
  const open = useDocStore((state) => state.open);
  const resolveConflict = useDocStore((state) => state.resolveConflict);

  if (!conflict || !open) return null;

  return (
    <div className="conflict-banner" role="alert">
      <p>
        <strong>{open.path}</strong> a été modifié en dehors de Cobblestone, et vos
        modifications ne sont pas enregistrées.
      </p>
      <div className="conflict-banner__actions">
        <button type="button" className="button" onClick={() => resolveConflict('disk')}>
          Recharger depuis le disque
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => resolveConflict('mine')}
        >
          Garder ma version
        </button>
      </div>
    </div>
  );
}
