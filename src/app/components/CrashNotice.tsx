import { useEffect, useState } from 'react';

import { previousSessionCrashed, reportCrash, revealLogFile } from '../crashReport';

const DESCRIPTION =
  "Cobblestone s'est fermé de manière inattendue.\n\nCe que je faisais à ce moment-là : ";

/**
 * Prévient qu'un crash a eu lieu à la session précédente, et propose de le
 * signaler. Un crash natif ne laisse aucune chance au frontend : c'est le seul
 * moment où l'on peut en parler à l'utilisateur.
 */
export function CrashNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void previousSessionCrashed().then((crashed) => {
      if (!cancelled && crashed) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="update-notice crash-notice" role="alert">
      <p>
        Cobblestone s'est fermé de manière inattendue lors de la dernière session. Si des
        modifications ont pu être sauvées, leur restauration vous est proposée.
      </p>
      <div className="update-notice__actions">
        <button type="button" className="button" onClick={() => setVisible(false)}>
          Fermer
        </button>
        <button type="button" className="button" onClick={() => void revealLogFile()}>
          Voir le journal
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            void reportCrash(DESCRIPTION);
            setVisible(false);
          }}
        >
          Signaler le problème
        </button>
      </div>
    </div>
  );
}
