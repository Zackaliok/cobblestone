//! Coquille native de Cobblestone.
//!
//! Aucune commande métier n'est exposée ici : le frontend parle directement aux
//! plugins officiels. C'est un choix, pas un manque — garder le moteur en
//! TypeScript le rend testable sans toolchain Rust, et réduit la surface native
//! à auditer. Si l'indexation d'un très gros monorepo devenait trop lente, le
//! parcours de fichiers serait le premier — et sans doute le seul — candidat à
//! une réécriture en commande Rust.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Cobblestone");
}
