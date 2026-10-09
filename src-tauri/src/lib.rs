//! Coquille native de Cobblestone.
//!
//! Aucune commande métier n'est exposée ici : le frontend parle directement aux
//! plugins officiels. C'est un choix, pas un manque — garder le moteur en
//! TypeScript le rend testable sans toolchain Rust, et réduit la surface native
//! à auditer. Si l'indexation d'un très gros monorepo devenait trop lente, le
//! parcours de fichiers serait le premier — et sans doute le seul — candidat à
//! une réécriture en commande Rust.

use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

/// Écrit les panics Rust dans le journal avant l'arrêt du processus.
///
/// Le profil release compile avec `panic = "abort"` : sans ce hook, un panic
/// ferme l'application sans laisser la moindre trace. Le hook s'exécute avant
/// l'abort, donc le message et l'emplacement atterrissent bien dans le fichier.
fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let name = thread.name().unwrap_or("<anonyme>");
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| (*message).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic sans message".to_string());
        let location = info
            .location()
            .map(|place| format!("{}:{}:{}", place.file(), place.line(), place.column()))
            .unwrap_or_else(|| "emplacement inconnu".to_string());

        log::error!("PANIC (thread {name}) à {location} : {payload}");
        log::logger().flush();
        default_hook(info);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();

    tauri::Builder::default()
        // En premier, pour que les journaux des autres plugins soient capturés.
        // Fichier `cobblestone.log` dans le dossier de logs de l'application
        // (Linux : ~/.local/share/<identifier>/logs). Une seule rotation :
        // assez pour un rapport de bug, sans grossir indéfiniment.
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("cobblestone".into()),
                    }),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(1_000_000)
                .rotation_strategy(RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // À enregistrer APRÈS `fs` et `dialog` : ce plugin restaure au démarrage
        // les autorisations de dossier accordées au runtime par le sélecteur de
        // fichiers. Sans lui, l'utilisateur devrait re-choisir chacun de ses
        // workspaces à chaque lancement.
        .plugin(tauri_plugin_persisted_scope::init())
        // Mise à jour automatique depuis les releases GitHub. `process` ne sert
        // qu'à relancer l'application une fois la nouvelle version installée.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Cobblestone");
}
