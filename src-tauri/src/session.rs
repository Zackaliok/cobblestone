//! Détection des fermetures inattendues et accès au journal (#28).
//!
//! Un crash natif (WebKitGTK, Mesa, `malloc()`…) tue le processus sans que ni
//! le frontend ni le hook de panic n'aient la main. On le repère au lancement
//! suivant : un marqueur est posé au démarrage et retiré à la fermeture normale.
//! S'il est encore là, la session précédente n'est pas allée au bout.
//!
//! Limite connue : deux instances lancées en même temps partagent le marqueur,
//! la seconde croira à un crash. Sans gravité — l'avertissement s'ignore.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_opener::OpenerExt;

const MARKER_FILE: &str = "session.lock";
/// Nom du fichier écrit par `tauri-plugin-log` (voir `lib.rs`).
const LOG_FILE: &str = "cobblestone.log";
/// Assez pour un rapport de bug, pas assez pour dépasser la taille d'une URL.
const MAX_TAIL_LINES: usize = 200;

pub struct PreviousSession {
    crashed: bool,
}

fn marker_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(MARKER_FILE))
}

/// Pose le marqueur de session et indique si la précédente a été interrompue.
pub fn open<R: Runtime>(app: &AppHandle<R>) -> PreviousSession {
    let Some(marker) = marker_path(app) else {
        return PreviousSession { crashed: false };
    };

    let crashed = marker.exists();
    if crashed {
        log::warn!("La session précédente ne s'est pas terminée normalement (crash ou arrêt forcé).");
    }

    let written = marker
        .parent()
        .map_or(Ok(()), std::fs::create_dir_all)
        .and_then(|()| std::fs::write(&marker, std::process::id().to_string()));
    if let Err(error) = written {
        log::warn!("Marqueur de session impossible à écrire ({}) : {error}", marker.display());
    }

    PreviousSession { crashed }
}

/// Retire le marqueur : appelé uniquement sur une fermeture normale.
pub fn close<R: Runtime>(app: &AppHandle<R>) {
    if let Some(marker) = marker_path(app) {
        let _ = std::fs::remove_file(marker);
    }
}

fn log_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path().app_log_dir().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn previous_session_crashed(state: State<'_, PreviousSession>) -> bool {
    state.crashed
}

/// Dernières lignes du journal, à joindre à un rapport de bug.
#[tauri::command]
pub fn read_log_tail<R: Runtime>(app: AppHandle<R>, lines: usize) -> Result<String, String> {
    let path = log_dir(&app)?.join(LOG_FILE);
    let content = std::fs::read(&path).map_err(|error| error.to_string())?;
    let content = String::from_utf8_lossy(&content);

    let all: Vec<&str> = content.lines().collect();
    let start = all.len().saturating_sub(lines.min(MAX_TAIL_LINES));
    Ok(all[start..].join("\n"))
}

/// Montre le fichier de journal dans le gestionnaire de fichiers.
#[tauri::command]
pub fn reveal_log_file<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let dir = log_dir(&app)?;
    let file = dir.join(LOG_FILE);
    let target = if file.exists() { file } else { dir };
    app.opener()
        .reveal_item_in_dir(target)
        .map_err(|error| error.to_string())
}
