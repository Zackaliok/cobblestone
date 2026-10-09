import { useEffect, useState } from 'react';

import { imageMimeType } from '../core/filesystem/FileSystem';
import { useDocStore, workspaceManager } from './store/DocStore';

export interface LoadedImage {
  /** URL `blob:` à passer à `<img src>`. À libérer avec `URL.revokeObjectURL`. */
  url: string;
  bytes: number;
}

/**
 * Lit une image du workspace et en fait une URL `blob:`, que l'appelant libère.
 *
 * On passe par les octets plutôt que par le protocole `asset:` de Tauri : ce
 * dernier exige un scope déclaré à l'avance, alors que les dossiers de
 * workspace sont choisis à l'exécution. La lecture reste ainsi soumise au
 * même scope que les documents. La CSP autorise déjà `img-src blob:`.
 */
export async function loadWorkspaceImage(workspaceId: string, path: string): Promise<LoadedImage> {
  const data = await workspaceManager.readBinary(workspaceId, path);
  // Copie dans un `ArrayBuffer` simple : le typage DOM refuse un tableau
  // potentiellement adossé à un `SharedArrayBuffer`.
  const blob = new Blob([new Uint8Array(data)], {
    type: imageMimeType(path) ?? 'application/octet-stream',
  });
  return { url: URL.createObjectURL(blob), bytes: data.byteLength };
}

type ImageState =
  | { status: 'loading' }
  | { status: 'ready'; image: LoadedImage }
  | { status: 'error'; message: string };

/**
 * Images déjà lues, partagées par les composants React. L'aperçu se recompile
 * à chaque modification du texte et recrée ses images : sans ce cache, chacune
 * serait relue — et clignoterait — à chaque frappe.
 */
const cache = new Map<string, Promise<LoadedImage>>();

function cachedImage(workspaceId: string, path: string): Promise<LoadedImage> {
  const key = `${workspaceId}::${path}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = loadWorkspaceImage(workspaceId, path);
    // Un échec n'est pas mémorisé : le fichier peut apparaître ensuite.
    entry.catch(() => cache.delete(key));
    cache.set(key, entry);
  }
  return entry;
}

// Un rescan (surveillance du dossier, création, renommage…) signale que des
// fichiers ont pu changer : les images de ce workspace seront relues.
useDocStore.subscribe((state, previous) => {
  for (const workspaceId of Object.keys(state.trees)) {
    if (state.trees[workspaceId] === previous.trees[workspaceId]) continue;
    for (const [key, entry] of cache) {
      if (!key.startsWith(`${workspaceId}::`)) continue;
      cache.delete(key);
      void entry.then((image) => URL.revokeObjectURL(image.url), () => {});
    }
  }
});

/** Image du workspace pour un composant React, via le cache partagé. */
export function useWorkspaceImage(workspaceId: string | null, path: string | null): ImageState {
  const [state, setState] = useState<ImageState>({ status: 'loading' });
  const trees = useDocStore((store) => store.trees);

  useEffect(() => {
    if (!workspaceId || !path) {
      setState({ status: 'error', message: 'Image introuvable dans le workspace' });
      return;
    }

    let cancelled = false;
    cachedImage(workspaceId, path)
      .then((image) => {
        if (!cancelled) setState({ status: 'ready', image });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      cancelled = true;
    };
    // `trees` : relire l'image après un rescan, qui a vidé le cache.
  }, [workspaceId, path, trees]);

  return state;
}
