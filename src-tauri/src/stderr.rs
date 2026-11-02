//! Capture de la sortie d'erreur native dans le dossier de logs (#44).
//!
//! Un crash natif ne passe ni par le hook de panic ni par le frontend : la glibc
//! (`malloc(): unaligned fastbin chunk detected`), GLib, GTK ou WebKitGTK
//! écrivent leur dernier message sur stderr, puis le processus meurt. Lancée
//! depuis le bureau, l'application n'a pour stderr que le journal systemd, que
//! ni l'utilisateur ni le rapport de crash ne consultent.
//!
//! Le descripteur 2 est donc redirigé vers `stderr.log`, à côté de
//! `cobblestone.log`, avant le démarrage de GTK. C'est le noyau qui écrit dans le
//! fichier : rien n'est alloué ni verrouillé de notre côté, ce qui reste fiable
//! jusque dans l'`abort()` qui suit une corruption mémoire. Les processus WebKit,
//! lancés ensuite, héritent du même descripteur.
//!
//! Chaque lancement renomme la sortie du précédent en `stderr.previous.log` :
//! c'est elle que le rapport de crash joint, puisque la session qui a planté est
//! toujours la précédente. Lancée depuis un terminal, l'application garde son
//! stderr à l'écran ; la rotation a lieu quand même, pour que
//! `stderr.previous.log` ne décrive jamais une session plus ancienne.

use std::path::PathBuf;

use tauri::{AppHandle, Runtime};

use crate::session::{log_dir, read_tail};

const CURRENT_FILE: &str = "stderr.log";
const PREVIOUS_FILE: &str = "stderr.previous.log";

/// Redirige stderr vers le dossier de logs ; renvoie le fichier utilisé.
///
/// À appeler en tout premier, tant que le processus n'a qu'un thread et que GTK
/// n'a encore rien écrit. Le dossier est calculé comme `app_log_dir` de Tauri
/// (Linux : `$XDG_DATA_HOME/<identifier>/logs`), faute d'application à
/// interroger à ce stade.
#[cfg(target_os = "linux")]
pub fn capture(identifier: &str, version: &str) -> Option<PathBuf> {
    use std::{fs, io::Write, os::fd::AsRawFd};

    let dir = dirs::data_local_dir()?.join(identifier).join("logs");
    let current = dir.join(CURRENT_FILE);
    let previous = dir.join(PREVIOUS_FILE);

    let _ = fs::remove_file(&previous);
    let _ = fs::rename(&current, &previous);

    // SAFETY: `isatty` ne fait que lire l'état d'un descripteur.
    if unsafe { libc::isatty(libc::STDERR_FILENO) } == 1 {
        return None;
    }

    fs::create_dir_all(&dir).ok()?;
    // `append` : WebKit et ses sous-processus écrivent dans le même fichier.
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&current)
        .ok()?;
    let _ = writeln!(
        file,
        "{} === Cobblestone {version}, pid {} ===",
        crate::timestamp(),
        std::process::id()
    );

    // SAFETY: les deux descripteurs sont valides ; `dup2` remplace stderr de
    // façon atomique. Le fichier peut ensuite être fermé : le descripteur 2
    // garde sa propre référence.
    if unsafe { libc::dup2(file.as_raw_fd(), libc::STDERR_FILENO) } == -1 {
        return None;
    }
    Some(current)
}

#[cfg(not(target_os = "linux"))]
pub fn capture(_identifier: &str, _version: &str) -> Option<PathBuf> {
    None
}

/// Vérifie, une fois l'application lancée, que la capture vise bien le dossier
/// que lisent les commandes ci-dessous. Silencieux quand tout va bien : une
/// ligne par lancement noierait le journal joint aux rapports de crash.
pub fn report<R: Runtime>(app: &AppHandle<R>, captured: Option<&PathBuf>) {
    let Some(path) = captured else {
        return;
    };
    let expected = log_dir(app).ok();
    if path.parent() != expected.as_deref() {
        log::warn!(
            "Sortie d'erreur native enregistrée hors du dossier de logs : {}",
            path.display()
        );
    }
}

/// Fin de la sortie d'erreur de la session précédente ; vide si elle n'en a pas
/// laissé (lancement depuis un terminal, autre système que Linux).
#[tauri::command]
pub fn read_previous_stderr_tail<R: Runtime>(
    app: AppHandle<R>,
    lines: usize,
) -> Result<String, String> {
    let path = log_dir(&app)?.join(PREVIOUS_FILE);
    if !path.exists() {
        return Ok(String::new());
    }
    read_tail(&path, lines)
}
