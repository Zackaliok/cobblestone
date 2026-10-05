import { useZoomStore } from '../store/ZoomStore';
import { DEFAULT_ZOOM, ZOOM_LEVELS, formatZoom } from '../zoom';

/** Loupe en bas de la fenêtre : − / niveau (clic = 100 %) / +. */
export function ZoomControl() {
  const level = useZoomStore((state) => state.level);
  const zoomIn = useZoomStore((state) => state.zoomIn);
  const zoomOut = useZoomStore((state) => state.zoomOut);
  const reset = useZoomStore((state) => state.reset);

  return (
    <div className="zoom-control" role="group" aria-label="Zoom">
      <svg
        className="zoom-control__icon"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="5" />
        <path d="m11 11 3.5 3.5" />
      </svg>
      <button
        type="button"
        onClick={zoomOut}
        disabled={level <= ZOOM_LEVELS[0]}
        title="Zoom arrière (Ctrl -)"
        aria-label="Zoom arrière"
      >
        −
      </button>
      <button
        type="button"
        className="zoom-control__level"
        onClick={reset}
        disabled={level === DEFAULT_ZOOM}
        title="Réinitialiser le zoom (Ctrl 0)"
      >
        {formatZoom(level)}
      </button>
      <button
        type="button"
        onClick={zoomIn}
        disabled={level >= ZOOM_LEVELS.at(-1)!}
        title="Zoom avant (Ctrl +)"
        aria-label="Zoom avant"
      >
        +
      </button>
    </div>
  );
}
