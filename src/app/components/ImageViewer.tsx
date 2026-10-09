import { useState } from 'react';

import { basename } from '../../core/filesystem/FileSystem';
import { useWorkspaceImage } from '../images';
import { useDocStore } from '../store/DocStore';

/**
 * Affichage d'une image seule, à la manière de VS Code : damier en fond (pour
 * voir la transparence), image ajustée à la fenêtre, clic pour passer en
 * taille réelle et inversement.
 */
export function ImageViewer() {
  const openImage = useDocStore((state) => state.openImage);
  const closeImage = useDocStore((state) => state.closeImage);
  const image = useWorkspaceImage(openImage?.workspaceId ?? null, openImage?.path ?? null);

  const [actualSize, setActualSize] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  if (!openImage) return null;

  return (
    <div className="image-viewer">
      <div
        className={actualSize ? 'image-viewer__stage is-actual-size' : 'image-viewer__stage'}
        onClick={() => setActualSize((value) => !value)}
        title={actualSize ? 'Cliquer pour ajuster à la fenêtre' : 'Cliquer pour la taille réelle'}
      >
        {image.status === 'ready' && (
          <img
            src={image.image.url}
            alt={basename(openImage.path)}
            onLoad={(event) =>
              setDimensions({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />
        )}
        {image.status === 'loading' && <p className="image-viewer__message">Chargement…</p>}
        {image.status === 'error' && (
          <p className="image-viewer__message image-viewer__message--error">
            Impossible d'afficher l'image : {image.message}
          </p>
        )}
      </div>

      <footer className="image-viewer__status">
        <span className="image-viewer__path" title={openImage.path}>
          {openImage.path}
        </span>
        {dimensions && (
          <span>
            {dimensions.width} × {dimensions.height}
          </span>
        )}
        {image.status === 'ready' && <span>{formatBytes(image.image.bytes)}</span>}
        <button type="button" className="image-viewer__toggle" onClick={() => setActualSize((v) => !v)}>
          {actualSize ? 'Ajuster' : 'Taille réelle'}
        </button>
        <button type="button" className="image-viewer__toggle" onClick={closeImage}>
          Fermer
        </button>
      </footer>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
