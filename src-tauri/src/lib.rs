//! Coquille native de Cobblestone.
//!
//! Aucune commande métier n'est exposée ici : le frontend parle directement aux
//! plugins officiels. Les seules commandes servent au diagnostic des crashs
//! (`session.rs`). C'est un choix, pas un manque — garder le moteur en
//! TypeScript le rend testable sans toolchain Rust, et réduit la surface native
//! à auditer. Si l'indexation d'un très gros monorepo devenait trop lente, le
//! parcours de fichiers serait le premier — et sans doute le seul — candidat à
//! une réécriture en commande Rust.

mod scope;
mod session;

use tauri::{Manager, RunEvent};
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

/// Bascule la webview en rendu logiciel si `COBBLESTONE_SOFTWARE_RENDERING=1`.
///
/// Sur certains GPU Intel que le Mesa du système ne sait pas initialiser
/// (`Could not get intel_device_info`, `failed to create dri2 screen` — #18,
/// #33), WebKitGTK n'affiche qu'une fenêtre grise. Le rendu logiciel contourne
/// le GPU, au prix de la fluidité : il reste donc un choix explicite de
/// l'utilisateur plutôt qu'un réglage par défaut. Les variables déjà présentes
/// dans l'environnement sont respectées.
#[cfg(target_os = "linux")]
fn configure_software_rendering() {
    if std::env::var_os("COBBLESTONE_SOFTWARE_RENDERING").as_deref() != Some("1".as_ref()) {
        return;
    }
    // Appelé avant le démarrage de Tauri, tant qu'aucun autre thread ne lit
    // l'environnement.
    for name in ["LIBGL_ALWAYS_SOFTWARE", "WEBKIT_DISABLE_COMPOSITING_MODE"] {
        if std::env::var_os(name).is_none() {
            std::env::set_var(name, "1");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_software_rendering();
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
        .setup(|app| {
            // Les plugins sont initialisés avant `setup` : les autorisations
            // restaurées par `persisted-scope` sont déjà en place.
            scope::grant_recursive_access(app.handle());
            let previous = session::open(app.handle());
            app.manage(previous);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            session::previous_session_crashed,
            session::read_log_tail,
            session::reveal_log_file,
        ])
        .build(tauri::generate_context!())
        .expect("erreur au lancement de Cobblestone")
        .run(|app, event| {
            // Fermeture normale, y compris le redémarrage après mise à jour.
            if let RunEvent::Exit = event {
                session::close(app);
            }
        });
}
