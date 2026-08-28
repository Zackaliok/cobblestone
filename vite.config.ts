import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Ne pas effacer l'écran : les erreurs de compilation Rust doivent rester lisibles.
  clearScreen: false,

  // Tauri expose ses variables d'environnement sous le préfixe TAURI_ENV_*.
  envPrefix: ['VITE_', 'TAURI_ENV_'],

  server: {
    port: 1420,
    // Tauri attend ce port précis : échouer plutôt que basculer silencieusement.
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  build: {
    // La webview est toujours récente (WebView2 / WKWebView / WebKitGTK).
    target: 'es2022',
    sourcemap: true,
  },
});
