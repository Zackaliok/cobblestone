import { useEffect, useState } from 'react';

import { isDesktop } from '../platform';

type Update = import('@tauri-apps/plugin-updater').Update;

/** Laisse l'application finir de charger ses workspaces avant d'aller sur le réseau. */
const CHECK_DELAY_MS = 5_000;

/**
 * Seuls les builds publiés par le workflow « Release » vérifient les mises à
 * jour : ils sont signés, et leur clé publique est injectée à ce moment-là.
 * Un build local ou de test n'a ni l'une ni l'autre — le laisser vérifier
 * proposerait une installation vouée à échouer.
 */
const UPDATER_ENABLED = import.meta.env.VITE_UPDATER_ENABLED === 'true';

type Phase =
  | { kind: 'idle' }
  | { kind: 'available'; update: Update }
  | { kind: 'downloading'; update: Update; received: number; total: number | null }
  | { kind: 'error'; message: string };

/**
 * Propose la nouvelle version quand il y en a une. Rien n'est installé sans
 * accord explicite : une mise à jour redémarre l'application, ce qui ne doit
 * jamais arriver au milieu d'une rédaction.
 */
export function UpdateNotice() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    if (!UPDATER_ENABLED || !isDesktop()) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void import('@tauri-apps/plugin-updater')
        .then(({ check }) => check())
        .then((update) => {
          if (!cancelled && update) setPhase({ kind: 'available', update });
        })
        .catch((error: unknown) => {
          // Pas de réseau, GitHub injoignable… : rien qui mérite d'interrompre
          // l'utilisateur. La vérification sera refaite au prochain lancement.
          console.warn('Vérification des mises à jour impossible', error);
        });
    }, CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (phase.kind === 'idle') return null;

  const install = async (update: Update) => {
    let received = 0;
    let total: number | null = null;
    setPhase({ kind: 'downloading', update, received, total });

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? null;
        if (event.event === 'Progress') received += event.data.chunkLength;
        setPhase({ kind: 'downloading', update, received, total });
      });
      // Sous Windows, l'installeur ferme lui-même l'application ; ailleurs, il
      // faut la relancer pour charger la nouvelle version.
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (error) {
      setPhase({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="update-notice" role="status">
      {phase.kind === 'available' && (
        <>
          <p>
            <strong>Cobblestone {phase.update.version}</strong> est disponible (version
            actuelle : {phase.update.currentVersion}).
          </p>
          <div className="update-notice__actions">
            <button type="button" className="button" onClick={() => setPhase({ kind: 'idle' })}>
              Plus tard
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => void install(phase.update)}
            >
              Mettre à jour et redémarrer
            </button>
          </div>
        </>
      )}

      {phase.kind === 'downloading' && (
        <p>
          Téléchargement de la version {phase.update.version}…{' '}
          {phase.total
            ? `${Math.round((phase.received / phase.total) * 100)} %`
            : `${(phase.received / 1_048_576).toFixed(1)} Mo`}
        </p>
      )}

      {phase.kind === 'error' && (
        <>
          <p>Mise à jour impossible : {phase.message}</p>
          <div className="update-notice__actions">
            <button type="button" className="button" onClick={() => setPhase({ kind: 'idle' })}>
              Fermer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
