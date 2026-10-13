/**
 * Réconciliation entre le document ouvert et le fichier sur le disque, quand
 * celui-ci a pu être modifié par un autre outil (IDE, agent IA, `git pull`…).
 *
 * Trois contenus entrent en jeu :
 * - `persisted` : ce que Cobblestone croit être sur le disque ;
 * - `draft`     : le brouillon en cours d'édition ;
 * - `disk`      : ce qui est réellement sur le disque.
 *
 * Règle directrice : ne jamais perdre de travail. Un brouillon intact est
 * rechargé sans rien demander ; un brouillon modifié n'est jamais écrasé, ni
 * par le disque ni — à l'inverse — en écrasant le disque à l'enregistrement.
 */

export type ExternalChange =
  /** Le disque n'a pas bougé. */
  | { kind: 'none' }
  /** Le disque a changé et le brouillon est intact : on recharge. */
  | { kind: 'reload'; disk: string }
  /** Le disque contient déjà exactement le brouillon : il suffit d'en prendre acte. */
  | { kind: 'adopt'; disk: string }
  /** Les deux ont divergé : c'est à l'utilisateur de trancher. */
  | { kind: 'conflict'; disk: string };

export function reconcileWithDisk({
  draft,
  persisted,
  disk,
}: {
  draft: string;
  persisted: string;
  disk: string;
}): ExternalChange {
  if (sameContent(disk, persisted)) return { kind: 'none' };
  if (sameContent(disk, draft)) return { kind: 'adopt', disk };
  if (draft === persisted) return { kind: 'reload', disk };
  return { kind: 'conflict', disk };
}

/**
 * Les fins de ligne ne comptent pas : un outil externe qui réenregistre en
 * CRLF sans rien changer d'autre ne doit pas déclencher de conflit.
 */
function sameContent(a: string, b: string): boolean {
  return a === b || a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
}
