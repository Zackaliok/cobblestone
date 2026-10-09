import { useDocStore } from '../store/DocStore';

/** Propose de restaurer le brouillon retrouvé après une fermeture inattendue. */
export function RecoveryNotice() {
  const recovery = useDocStore((state) => state.recovery);
  const restoreRecovery = useDocStore((state) => state.restoreRecovery);
  const dismissRecovery = useDocStore((state) => state.dismissRecovery);

  if (!recovery) return null;

  return (
    <div className="toast toast--info recovery" role="alert">
      <span>
        Des modifications non enregistrées de <strong>{recovery.path}</strong> (
        {new Date(recovery.savedAt).toLocaleString()}) ont été retrouvées.
      </span>
      <button type="button" onClick={() => void restoreRecovery()}>
        Restaurer
      </button>
      <button type="button" onClick={dismissRecovery} aria-label="Ignorer">
        Ignorer
      </button>
    </div>
  );
}
