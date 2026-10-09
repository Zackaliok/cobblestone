import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalDiagnostics } from './diagnostics';
import { startRecoveryAutosave } from './recovery';
import './styles.css';

installGlobalDiagnostics();
startRecoveryAutosave();

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
