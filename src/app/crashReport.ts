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
/** La cause d'un crash natif tient dans les dernières lignes ; le début n'est que bruit de démarrage. */
const NATIVE_LOG_LINES = 25;

export interface CrashReport {
  /** Ce que l'on sait de l'erreur ; vide pour un crash natif constaté après coup. */
  description: string;
  version: string;
  os: string;
  /** Fin du journal de l'application, éventuellement vide. */
  log: string;
  /**
   * Fin de la sortie d'erreur native de la session interrompue : c'est là que
   * la glibc, GTK ou WebKit laissent la cause d'un crash natif (#44).
   */
  nativeLog?: string;
}

function codeSection(title: string, lines: string[]): string | null {
  return lines.length > 0 ? `${title} :\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`` : null;
}

function issueUrl(report: CrashReport, log: string[], nativeLog: string[]): string {
  const params = new URLSearchParams({
    template: '1-bug.yml',
    title: 'Crash : ',
    description: report.description,
    version: report.version,
    os: report.os,
  });
  const sections = [
    codeSection('Fin de cobblestone.log', log),
    codeSection("Sortie d'erreur de la session interrompue (stderr.previous.log)", nativeLog),
  ].filter((section): section is string => section !== null);
  if (sections.length > 0) params.set('logs', sections.join('\n\n'));
  return `${NEW_ISSUE_URL}?${params.toString()}`;
}

function splitLines(text: string | undefined): string[] {
  return text ? text.split('\n') : [];
}

/**
 * URL du formulaire prérempli. Si elle est trop longue, les journaux sont
 * raccourcis par le début, le plus long d'abord : leur fin, la plus proche du
 * crash, est ce qui compte.
 */
export function buildIssueUrl(report: CrashReport): string {
  const log = splitLines(report.log);
  const nativeLog = splitLines(report.nativeLog);
  let url = issueUrl(report, log, nativeLog);
  while (url.length > MAX_URL_LENGTH && log.length + nativeLog.length > 0) {
    (log.length >= nativeLog.length ? log : nativeLog).shift();
    url = issueUrl(report, log, nativeLog);
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

async function readTail(command: string, lines: number): Promise<string> {
  if (!isDesktop()) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>(command, { lines });
  } catch {
    return '';
  }
}

interface ReportOptions {
  /** Le crash a eu lieu à la session précédente : joindre sa sortie native. */
  previousSession?: boolean;
}

export async function reportCrash(description: string, options: ReportOptions = {}): Promise<void> {
  const url = buildIssueUrl({
    description,
    version: await appVersion(),
    os: navigator.userAgent,
    log: await readTail('read_log_tail', LOG_LINES),
    nativeLog: options.previousSession
      ? await readTail('read_previous_stderr_tail', NATIVE_LOG_LINES)
      : undefined,
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
