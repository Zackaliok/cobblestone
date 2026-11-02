//! Accès récursif aux dossiers de workspace (#42).
//!
//! Sans `recursive: true`, le sélecteur de dossier n'autorise que le premier
//! niveau du dossier choisi : le scope reçoit `<racine>` et `<racine>/*`, et ce
//! `*` ne traverse pas les `/`. Jusqu'à la 0.3.1, Cobblestone oubliait l'option :
//! un sous-dossier se créait et s'affichait, mais aucun fichier ne pouvait s'y
//! lire ni s'y écrire.
//!
//! Le frontend demande désormais un accès récursif, mais les workspaces ouverts
//! avant sont restaurés tels quels par `tauri-plugin-persisted-scope`. On étend
//! donc au démarrage chaque autorisation de dossier non récursive à toute son
//! arborescence. Cobblestone n'accorde de dossier que via le sélecteur de
//! workspace : c'est l'accès que l'utilisateur croyait déjà avoir donné.

use std::{
    collections::HashSet,
    path::{PathBuf, MAIN_SEPARATOR},
};

use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

/// À appeler après l'initialisation de `persisted-scope`, donc depuis `setup`.
pub fn grant_recursive_access<R: Runtime>(app: &AppHandle<R>) {
    let Some(scope) = app.try_fs_scope() else {
        return;
    };
    let allowed: HashSet<String> = scope
        .allowed_patterns()
        .iter()
        .map(|pattern| pattern.as_str().to_string())
        .collect();

    for pattern in &allowed {
        let Some(directory) = shallow_directory(pattern) else {
            continue;
        };
        // `<racine>/**` déjà présent : migration faite à un lancement précédent.
        if allowed.contains(&format!("{pattern}*")) {
            continue;
        }
        // Émet `PathAllowed` : `persisted-scope` enregistre aussitôt le nouveau motif.
        match scope.allow_directory(&directory, true) {
            Ok(()) => log::info!("Accès récursif accordé à {}", directory.display()),
            Err(error) => log::warn!(
                "Accès récursif impossible pour {} : {error}",
                directory.display()
            ),
        }
    }
}

/// Dossier d'un motif `<dossier>/*`, tel que l'écrit `allow_directory(…, false)`.
///
/// `<dossier>/**` garde un `*` final une fois le premier retiré, et un nom de
/// fichier finit par `]` puisque son `*` éventuel est échappé en `[*]` : seuls
/// les motifs non récursifs se terminent par un séparateur suivi de `*`.
fn shallow_directory(pattern: &str) -> Option<PathBuf> {
    let directory = pattern.strip_suffix('*')?;
    directory
        .ends_with(MAIN_SEPARATOR)
        .then(|| PathBuf::from(unescape(directory)))
}

/// Inverse de `glob::Pattern::escape`, qui écrit `?`, `*`, `[` et `]` sous la
/// forme `[?]`, `[*]`, `[[]` et `[]]`.
fn unescape(pattern: &str) -> String {
    let mut path = String::with_capacity(pattern.len());
    let mut rest = pattern;

    while let Some(c) = rest.chars().next() {
        match rest.as_bytes() {
            [b'[', escaped @ (b'?' | b'*' | b'[' | b']'), b']', ..] => {
                path.push(char::from(*escaped));
                rest = &rest[3..];
            }
            _ => {
                path.push(c);
                rest = &rest[c.len_utf8()..];
            }
        }
    }

    path
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::scope::fs::Pattern;

    /// Reproduit les motifs écrits par `tauri::scope::fs::Scope::allow_directory`.
    fn directory_pattern(path: &str, recursive: bool) -> String {
        let suffix = if recursive { "**" } else { "*" };
        format!("{}{MAIN_SEPARATOR}{suffix}", Pattern::escape(path))
    }

    #[test]
    fn retrouve_le_dossier_d_un_motif_non_recursif() {
        let root = format!("{MAIN_SEPARATOR}home{MAIN_SEPARATOR}notes");
        assert_eq!(
            shallow_directory(&directory_pattern(&root, false)),
            Some(PathBuf::from(format!("{root}{MAIN_SEPARATOR}")))
        );
    }

    #[test]
    fn ignore_les_motifs_recursifs_et_les_fichiers() {
        let root = format!("{MAIN_SEPARATOR}home{MAIN_SEPARATOR}notes");
        assert_eq!(shallow_directory(&directory_pattern(&root, true)), None);
        assert_eq!(shallow_directory(&Pattern::escape(&root)), None);
        assert_eq!(
            shallow_directory(&Pattern::escape(&format!("{root}{MAIN_SEPARATOR}*"))),
            None
        );
    }

    #[test]
    fn restaure_les_caracteres_speciaux_echappes() {
        let root = format!("{MAIN_SEPARATOR}home{MAIN_SEPARATOR}[notes] *?é");
        assert_eq!(
            shallow_directory(&directory_pattern(&root, false)),
            Some(PathBuf::from(format!("{root}{MAIN_SEPARATOR}")))
        );
    }
}
