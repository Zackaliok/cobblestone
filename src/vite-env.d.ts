/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `'true'` dans les builds publiés par le workflow Release (mise à jour automatique active). */
  readonly VITE_UPDATER_ENABLED?: string;
}
