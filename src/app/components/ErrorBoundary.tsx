import { Component, type ErrorInfo, type ReactNode } from 'react';

import { logError } from '../diagnostics';
import { flushRecovery } from '../recovery';

interface Props {
  /** Quand cette valeur change, l'erreur est oubliée et l'enfant re-rendu. */
  resetKey?: unknown;
  /** `app` : plein écran, dernier recours. `view` : n'occupe que la zone de contenu. */
  scope: 'app' | 'view';
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Sans cette frontière, une erreur de rendu démonte toute l'application :
 * fenêtre blanche, aucune trace. On journalise, on met le brouillon à l'abri,
 * et on affiche l'erreur plutôt que de la taire.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void logError(`Erreur de rendu (${this.props.scope})`, error);
    if (info.componentStack) void logError('Pile de composants', info.componentStack);
    void flushRecovery();
  }

  override componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className={`crash crash--${this.props.scope}`} role="alert">
        <h2>Une erreur est survenue</h2>
        <p>
          Vos modifications en cours ont été mises de côté et vous seront proposées à la
          prochaine ouverture. Le détail est enregistré dans les logs de l'application.
        </p>
        <pre className="crash__detail">{error.stack ?? error.message}</pre>
        <div className="crash__actions">
          <button type="button" className="button" onClick={() => this.setState({ error: null })}>
            Réessayer
          </button>
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
            Recharger l'application
          </button>
        </div>
      </div>
    );
  }
}
