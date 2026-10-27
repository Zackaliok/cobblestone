import { logError } from './diagnostics';
import { isDesktop } from './platform';

/**
 * Signalement d'un crash : ouvre le formulaire de bug GitHub prérempli avec la
 * version, le système et la fin du journal. Rien ne part sans que l'utilisateur
 * relise et valide le formulaire — le journal peut contenir des chemins privés.
 */

const NEW_ISSUE_URL = 'https://github.com/Zackaliok/cobblestone/issues/new';
/** Les navigateurs et GitHub tronquent ou refusent au-delà de ~8 000 caractères. */
const MAX_URL_LENGTH = 7000;
const LOG_LINES = 60;

export interface CrashReport {
  /** Ce que l'on sait de l'erreur ; vide pour un crash natif constaté après coup. */
  description: string;
  version: string;
  os: string;
  /** Fin du journal de l'application, éventuellement vide. */
  log: string;
}

function issueUrl(report: CrashReport, log: string): string {
  const params = new URLSearchParams({
    template: '1-bug.yml',
    title: 'Crash : ',
    description: report.description,
    version: report.version,
    os: report.os,
  });
  if (log) params.set('logs', `Fin de cobblestone.log :\n\n\`\`\`\n${log}\n\`\`\``);
  return `${NEW_ISSUE_URL}?${params.toString()}`;
}

/** URL du formulaire prérempli ; le journal est raccourci par le début s'il le faut. */
export function buildIssueUrl(report: CrashReport): string {
  const lines = report.log.split('\n');
  let url = issueUrl(report, report.log);
  while (url.length > MAX_URL_LENGTH && lines.length > 0) {
    lines.shift();
    url = issueUrl(report, lines.join('\n'));
  }
  return url;
}

async function appVersion(): Promise<string> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return 'inconnue';
  }
}

async function logTail(): Promise<string> {
  if (!isDesktop()) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('read_log_tail', { lines: LOG_LINES });
  } catch {
    return '';
  }
}

export async function reportCrash(description: string): Promise<void> {
  const url = buildIssueUrl({
    description,
    version: await appVersion(),
    os: navigator.userAgent,
    log: await logTail(),
  });

  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** Montre le fichier de journal dans le gestionnaire de fichiers. */
export async function revealLogFile(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('reveal_log_file');
  } catch (error) {
    void logError("Impossible d'afficher le journal", error);
  }
}

/** La session précédente s'est-elle arrêtée sans passer par une fermeture normale ? */
export async function previousSessionCrashed(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<boolean>('previous_session_crashed');
  } catch {
    return false;
  }
}
