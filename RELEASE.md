# Publier une version de Cobblestone

Les versions publiées par le workflow **Release** se mettent à jour toutes seules : au
démarrage, l'application consulte
`https://github.com/Zackaliok/cobblestone/releases/latest/download/latest.json`, et si une
version plus récente existe, propose de l'installer puis redémarre.

Plus besoin de relancer un build, de le télécharger puis de le lancer en portable à chaque
changement.

## Mise en place (une seule fois)

Les mises à jour sont **signées** : l'application refuse tout fichier qui ne l'est pas
avec la bonne clé, même s'il vient de la bonne URL.

1. Générer la paire de clés, en local :

   ```sh
   npm run tauri signer generate -- -w ~/.tauri/cobblestone.key
   ```

   Garder `~/.tauri/cobblestone.key` en lieu sûr : **si elle est perdue, les installations
   existantes ne pourront plus se mettre à jour**, il faudra les réinstaller à la main.

2. Dans GitHub → *Settings* → *Secrets and variables* → *Actions* :

   | Type | Nom | Valeur |
   |---|---|---|
   | Secret | `TAURI_SIGNING_PRIVATE_KEY` | contenu de `~/.tauri/cobblestone.key` |
   | Secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | le mot de passe choisi (vide si aucun) |
   | Variable | `TAURI_UPDATER_PUBKEY` | contenu de `~/.tauri/cobblestone.key.pub` |

## Publier

1. Augmenter `version` dans `package.json` (ex. `0.1.0` → `0.2.0`). C'est la seule source
   de vérité : `tauri.conf.json` la lit directement.
2. Commiter et pousser sur `main`.
3. GitHub → *Actions* → **Release** → *Run workflow*.

Le workflow construit l'installeur Windows et l'AppImage Linux, crée la release `v<version>`
et y joint `latest.json`. Les applications installées la proposeront à leur prochain
lancement.

## Ce qui se met à jour, et ce qui ne le peut pas

| Format | Mise à jour automatique |
|---|---|
| Installeur Windows (`*-setup.exe`) | ✅ |
| AppImage Linux | ✅ |
| Exécutable portable Windows (workflow *Build Windows*) | ❌ — rien à mettre à jour sur place |
| Paquet `.deb` (workflow *Build Linux*) | ❌ — passer par `apt` / `dpkg` |
| Build local (`npm run tauri build`) | ❌ — non signé, la vérification est désactivée |

Pour profiter des mises à jour, il faut donc **installer une fois** une version issue du
workflow Release ; les suivantes arrivent toutes seules.
