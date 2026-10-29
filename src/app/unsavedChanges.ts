import { logError } from './diagnostics';
import { isDesktop } from './platform';

/**
 * Que faire du brouillon modifié quand on s'apprête à quitter le document ?
 *
 * Ouvrir une autre note remplace le brouillon : sans cette question, les
 * modifications non enregistrées disparaissaient au premier clic dans l'arbre
 * — et leur copie de secours avec elles (#28).
 */
export type LeaveChoice = 'save' | 'discard' | 'cancel';

const SAVE = 'Enregistrer';
const DISCARD = 'Ne pas enregistrer';
const CANCEL = 'Annuler';

export async function askToLeave(path: string): Promise<LeaveChoice> {
  const text = `« ${path} » contient des modifications non enregistrées.`;

  if (!isDesktop()) {
    // Mode démo : `confirm` n'offre que deux réponses, on ne propose donc pas
    // d'enregistrer depuis la boîte de dialogue.
    return window.confirm(`${text}\nAbandonner ces modifications ?`) ? 'discard' : 'cancel';
  }

  try {
    const { message } = await import('@tauri-apps/plugin-dialog');
    const answer = await message(text, {
      title: 'Modifications non enregistrées',
      kind: 'warning',
      buttons: { yes: SAVE, no: DISCARD, cancel: CANCEL },
    });
    if (answer === SAVE || answer === 'Yes') return 'save';
    if (answer === DISCARD || answer === 'No') return 'discard';
    return 'cancel';
  } catch (error) {
    // Pas de boîte de dialogue : dans le doute, on garde le brouillon.
    void logError('Boîte de dialogue « modifications non enregistrées » indisponible', error);
    return 'cancel';
  }
}
