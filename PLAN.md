# Cobblestone

Cobblestone est un clone d'Obsidian **desktop (Tauri 2.0)** conçu pour gérer de la documentation dans un gros monorepo, des notes personnelles et remplacer un Mediawiki existant — le tout dans une même interface unifiée via un système de **workspaces**.

---

## Vision Générale

Cobblestone répond à trois cas d'utilisation principaux :

1. **Notes personnelles** — Un espace de notes locales avec liens wiki et graph de connaissances
2. **Documentation de projet** — Documentation MDX intégrée directement dans les repos d'un monorepo
3. **Wiki d'entreprise** — Remplacement de Mediawiki pour les équipes (spécifications, connaissances, processus, notes partagées), avec authentification LDAP et versionning Git automatique

---

## Décision structurante : application desktop Tauri 2.0

Cobblestone n'est **pas** une application web. C'est une application desktop native construite avec **Tauri 2.0** : frontend React/TypeScript rendu dans la webview système, coquille native en Rust.

### Pourquoi

| Problème en navigateur | Résolution avec Tauri 2.0 |
|---|---|
| File System Access API non supportée sur Firefox / Safari | `@tauri-apps/plugin-fs` — API identique sur Windows, macOS, Linux |
| Permission de dossier redemandée à chaque session | `tauri-plugin-persisted-scope` — l'autorisation survit au redémarrage |
| Handles opaques, pas de chemins réels | Chemins absolus natifs → résolution des liens cross-workspace triviale |
| CORS vers le serveur wiki | `@tauri-apps/plugin-http` — requêtes émises par Rust, hors du modèle CORS |
| Pas d'accès à `git` local | `@tauri-apps/plugin-shell` avec allow-list de commandes |
| Pas de surveillance de fichiers | `watch()` de `plugin-fs` (notify côté Rust) |

### Portée retenue

- **Cible unique : Tauri.** Pas de build navigateur en parallèle. `LocalFileSystem` (File System Access API) est **supprimé** du plan et remplacé par `TauriFileSystem`.
- **Rust minimal, JS-first.** Aucune commande Rust métier au départ : `src-tauri/` se limite à enregistrer les plugins officiels. Tout le `core/` reste du TypeScript pur, testable hors Tauri.
- **Le serveur wiki reste distant.** Express + Git + LDAP tournent sur un serveur d'entreprise ; l'app desktop n'est qu'un client HTTP. Pas de sidecar embarqué.

---

## Système de Workspaces

Plusieurs workspaces ouverts simultanément dans une même interface. Chaque workspace représente une source de documentation indépendante.

### Types de Workspace

| Type | Description | Stockage | Versionning |
|---|---|---|---|
| `local` | Dossier local (notes personnelles, doc de projet dans un repo) | `plugin-fs` (Tauri, chemin absolu) | Aucune écriture Git — historique en **lecture seule** |
| `server` | Wiki entreprise hébergé sur un serveur Cobblestone | API REST via `plugin-http` | Automatique — chaque edit = commit Git avec auteur LDAP |

**Important** : pour le type `local`, Cobblestone **n'écrit jamais dans Git** — aucun `add`, `commit`, `push`, ni création de branche. L'application lit et écrit directement les fichiers du dossier (qui peut être un repo Git). Le développeur garde la main totale sur ses commit et ses PR. Seule concession ajoutée : la lecture de `git log` pour afficher l'historique (voir Phase 4).

### Liens Cross-Workspace

- `[[ma-page]]` — Lien dans le même workspace
- `[[Projet Alpha:ma-page]]` — Lien vers un fichier dans un autre workspace
- `[[Wiki:process:onboarding]]` — Lien vers une page du wiki

### Persistance

La liste des workspaces (nom, type, chemin absolu ou URL serveur) est sauvegardée via **`@tauri-apps/plugin-store`** dans un fichier JSON du répertoire de données de l'app — pas dans `localStorage`, qui serait purgé avec le cache de la webview.

Le **scope d'accès filesystem** accordé par le sélecteur de dossier est persisté séparément par `tauri-plugin-persisted-scope`. Les deux doivent rester cohérents : au démarrage, un workspace dont le chemin n'est plus lisible est marqué « indisponible » plutôt que supprimé.

---

## Fonctionnalités

### Fonctionnalités Communes (tous workspaces)

| Fonctionnalité | Description |
|---|---|
| **CRUD fichiers MDX** | Créer, éditer, supprimer des fichiers `.mdx` |
| **Navigation arborescence** | Barre latérale avec hiérarchie dossiers/fichiers du workspace actif |
| **Liens internes `[[wiki-link]]`** | Support des liens type Obsidian, y compris cross-workspace |
| **Graph de connaissances** | Visualisation interactive des liens (par workspace + global agrégé) |
| **Recherche full-text** | Recherche dans le contenu (workspace actif ou globale) |
| **Éditeur double mode** | WYSIWYG (Editor.js) + vue source MDX brute |
| **Aperçu rendu** | Rendu MDX avec wiki-links cliquables, frontmatter, headings |
| **Historique (lecture seule)** | `git log` du fichier courant, si le workspace est un repo Git |
| **Rafraîchissement auto** | `watch()` sur le dossier : l'arbre et le graph se mettent à jour si tu édites depuis ton IDE |

### Fonctionnalités Spécifiques Mode Serveur (Wiki)

| Fonctionnalité | Description |
|---|---|
| **Auth LDAP** | Connexion avec compte LDAP entreprise (configuration **exclusivement côté serveur**) |
| **Auto-commit Git** | Chaque modification est automatiquement commitée par le backend avec l'auteur LDAP |
| **Historique + diff** | Panel d'historique par fichier (`git log` + `git show`) |
| **Traçabilité** | Savoir qui a modifié quoi et quand |

---

## Éditeur

### Double Mode

1. **Mode WYSIWYG** — Éditeur block-based avec Editor.js, style Notion
2. **Mode Source** — Édition directe du code MDX brut

### Raccourcis (style Notion)

| Raccourci | Action |
|---|---|
| `/` | Ouvrir le menu de blocs |
| `#` | Titre H1 |
| `##` | Titre H2 |
| `###` | Titre H3 |
| `-` | Liste à puces |
| `1.` | Liste numérotée |
| `>` | Citation |
| triple backtick | Bloc de code |
| `[[` | Wiki-link |

### Composants Personnalisés

Insérables depuis le menu `/` :

- `<Callout type="info" />` — Encadré informatif
- `<Callout type="warning" />` — Encadré d'avertissement
- `<Accordion />` — Section pliable
- `<Toggle />` — Toggle on/off

---

## Stack Technique

| Couche | Technologie |
|---|---|
| **Shell desktop** | **Tauri 2.0** (Rust + webview système) |
| **Frontend** | React + TypeScript + Vite |
| **State Management** | Zustand |
| **Éditeur WYSIWYG** | Editor.js (block-based, gratuit MIT) |
| **Rendu MDX** | @mdx-js/react |
| **Frontmatter YAML** | js-yaml |
| **Graph Visualization** | D3.js ou react-force-graph |
| **Backend (distant)** | Express |
| **LDAP** | ldapjs (interface AuthProvider, config `.env` serveur) |
| **Git (serveur)** | isomorphic-git (auto-commit côté serveur) |
| **Git (local, lecture)** | `plugin-shell` → binaire `git` système, allow-list stricte |

### Plugins Tauri

| Plugin | Rôle | Criticité |
|---|---|---|
| `plugin-fs` | Lire/écrire/supprimer les `.mdx`, lister l'arborescence, `watch()` | **Indispensable** |
| `plugin-dialog` | Sélecteur de dossier (`open({ directory: true })`) → ouverture d'un workspace local | **Indispensable** |
| `persisted-scope` | Restaure les autorisations FS accordées au runtime après redémarrage | **Indispensable** |
| `plugin-store` | Persistance de la liste des workspaces et des préférences | **Indispensable** |
| `plugin-http` | Appels REST vers le serveur wiki, scopés par URL | Mode serveur |
| `plugin-shell` | `git log` / `git show` sur les workspaces locaux | Historique local |
| `plugin-opener` | Ouvrir un lien externe dans le navigateur par défaut | Confort |
| `plugin-window-state` | Restaurer taille et position de la fenêtre | Confort |
| `plugin-updater` | Mises à jour automatiques signées | Phase 5 |

> `persisted-scope` est le point le plus facile à oublier : sans lui, chaque redémarrage exige de re-sélectionner tous les dossiers au sélecteur de fichiers. C'est l'équivalent Tauri des handles persistés de la File System Access API.

---

## Architecture

```
cobblestone/
├── src/
│   ├── core/                        # Moteur commun — TypeScript pur, testable sans Tauri
│   │   ├── workspace/
│   │   │   ├── WorkspaceManager.ts  # Gestion multi-workspace
│   │   │   └── types.ts             # Workspace, Note, etc.
│   │   ├── filesystem/
│   │   │   ├── FileSystem.ts        # Interface commune
│   │   │   ├── TauriFileSystem.ts   # plugin-fs (mode local)  <- remplace LocalFileSystem
│   │   │   ├── ServerFileSystem.ts  # API REST via plugin-http (mode serveur)
│   │   │   └── MemoryFileSystem.ts  # Implémentation en mémoire, pour les tests
│   │   ├── parser/
│   │   │   ├── MDXParser.ts         # Parsing frontmatter, wiki-links, cross-workspace
│   │   │   ├── MDXEditorConverter.ts# Convertisseur Editor.js JSON <-> MDX
│   │   │   └── types.ts
│   │   ├── graph/
│   │   │   ├── KnowledgeGraph.ts    # Graphe de liens entre notes
│   │   │   └── types.ts
│   │   ├── git/
│   │   │   └── LocalGitLog.ts       # git log en lecture seule via plugin-shell
│   │   └── index.ts
│   │
│   ├── app/                         # Frontend React
│   │   ├── components/
│   │   │   ├── WorkspaceTabs.tsx    # Onglets workspaces
│   │   │   ├── Sidebar.tsx          # Arborescence + recherche
│   │   │   ├── Editor.tsx           # Éditeur double mode (WYSIWYG + Source)
│   │   │   ├── Preview.tsx          # Rendu MDX
│   │   │   ├── GraphView.tsx        # Graph (workspace + global)
│   │   │   ├── HistoryPanel.tsx     # Historique Git (serveur + local lecture seule)
│   │   │   └── SearchBar.tsx        # Recherche full-text
│   │   ├── hooks/
│   │   │   ├── useWorkspace.ts
│   │   │   ├── useDocStore.ts
│   │   │   └── useSearch.ts
│   │   ├── store/
│   │   │   └── DocStore.ts          # Zustand multi-workspace
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── index.ts
│
├── src-tauri/                       # Coquille native — volontairement minimale
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json              # Fenêtre, bundle, CSP, identifier
│   ├── capabilities/
│   │   └── default.json             # Permissions accordées à la fenêtre `main`
│   ├── icons/
│   └── src/
│       ├── main.rs                  # Point d'entrée (appelle lib.rs)
│       └── lib.rs                   # Enregistrement des plugins — aucune logique métier
│
├── server/                          # Backend wiki — déployé séparément, PAS bundlé
│   ├── server.ts                    # Express server
│   ├── routes/
│   │   ├── files.ts                 # CRUD fichiers MDX
│   │   ├── git.ts                   # Historique, diff (git log)
│   │   └── auth.ts                  # Auth LDAP
│   ├── git/
│   │   └── GitManager.ts            # Wrapper isomorphic-git (auto-commit)
│   ├── auth/
│   │   └── LdapAuthProvider.ts      # Implémentation LDAP configurable
│   └── .env.example                 # Config LDAP, port — reste sur le serveur
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

> `server/` sort de `src/` : ce n'est plus un mode de l'application mais un service distinct, déployé et versionné à part. Il ne doit jamais entrer dans le bundle Tauri.

---

## Configuration Tauri

### `src-tauri/capabilities/default.json`

Tauri 2.0 remplace l'`allowlist` de la v1 par un système de **capabilities** : chaque fenêtre reçoit un jeu explicite de permissions.

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permissions de base de Cobblestone",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "store:default",
    "persisted-scope:default",
    "opener:allow-open-url",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-read-dir",
    "fs:allow-mkdir",
    "fs:allow-remove",
    "fs:allow-exists",
    "fs:allow-watch",
    {
      "identifier": "http:default",
      "allow": [{ "url": "https://wiki.entreprise.local/*" }]
    },
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "git-log",
          "cmd": "git",
          "args": ["-C", { "validator": "\\S+" }, "log", "--follow", "--format=%H%x1f%an%x1f%aI%x1f%s", "--", { "validator": "\\S+" }]
        }
      ]
    }
  ]
}
```

Deux points à retenir :

- **Aucun scope FS statique.** Les permissions `fs:allow-*` autorisent l'*opération*, pas le *chemin*. Le chemin est autorisé au runtime, uniquement quand l'utilisateur choisit un dossier via `plugin-dialog` — puis conservé par `persisted-scope`. Aucun dossier n'est lisible tant que l'utilisateur ne l'a pas explicitement ouvert.
- **`shell:allow-execute` est une allow-list, pas un shell.** Seule la forme exacte `git log …` déclarée ici est exécutable, avec des arguments validés par regex. Aucune autre commande n'est atteignable depuis le frontend.

### `src-tauri/tauri.conf.json` (extrait)

```json
{
  "productName": "Cobblestone",
  "identifier": "local.entreprise.cobblestone",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{ "title": "Cobblestone", "width": 1400, "height": 900 }],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data:; connect-src 'self' ipc: http://ipc.localhost https://wiki.entreprise.local"
    }
  },
  "bundle": { "active": true, "targets": ["msi", "nsis", "deb", "dmg"] }
}
```

### `vite.config.ts` — adaptations Tauri

```ts
export default defineConfig({
  plugins: [react()],
  clearScreen: false,              // ne pas masquer les erreurs Rust
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: {
    port: 1420,
    strictPort: true,              // Tauri attend ce port précis
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
```

### Configuration applicative

La config sensible (LDAP, secrets) **reste exclusivement sur le serveur**. Tout ce qui est compilé dans le bundle desktop est lisible par n'importe quel utilisateur : le client ne connaît que l'URL du serveur wiki, saisie dans l'UI à la création du workspace et stockée via `plugin-store`.

Le jeton de session LDAP est conservé en mémoire pour la session courante. S'il doit survivre au redémarrage, passer par `tauri-plugin-stronghold` (chiffré) — jamais par `plugin-store`, qui écrit du JSON en clair.

### Mode Serveur (`.env`, côté serveur uniquement)

```env
# Serveur
PORT=3001
DOC_ROOT=/path/to/docs

# LDAP
LDAP_URL=ldap://ldap.entreprise.local:389
LDAP_BIND_DN=cn=%s,ou=users,dc=entreprise,dc=local
LDAP_SEARCH_BASE=ou=users,dc=entreprise,dc=local
LDAP_USE_TLS=false

# Git
GIT_AUTHOR_NAME=Cobblestone
GIT_AUTHOR_EMAIL=cobblestone@entreprise.local
```

---

## Interface Utilisateur

```
┌─────────────────────────────────────────────────────────────────┐
│  [ Notes]  [ Projet Alpha]  [ Wiki]  [+ Nouveau Workspace]      │  <- Workspace tabs
├────────────┬────────────────────────────────────────────────────┤
│            │  [WYSIWYG]  [Source]  [Graph]  [Historique]*       │  <- Editor tabs
│  Sidebar   │  ┌──────────────────────────────────────────┐      │
│  Arbre des │  │                                          │      │
│  fichiers  │  │  Contenu (édition WYSIWYG ou source MDX) │      │
│  du        │  │                                          │      │
│  workspace │  │                                          │      │
│  actif     │  └──────────────────────────────────────────┘      │
│            │                                                    │
│  [ Recherche globale]                                           │
├────────────┴────────────────────────────────────────────────────┤
│  [Graph Global]  [Récents]                                      │  <- Panels bas
└─────────────────────────────────────────────────────────────────┘
* Historique : complet en mode serveur, lecture seule en mode local (si repo Git)
```

---

## Plan de Développement

> État au 28/08/2026 : le mode local est terminé et vérifié. Le mode serveur est reporté
> à la demande — la spécification plus haut reste la référence pour le reprendre.

### Phase 0 — Socle Tauri

- [x] `src-tauri/` : Cargo.toml, build.rs, main.rs, lib.rs
- [x] Plugins : fs (avec watch), dialog, persisted-scope, store, shell, opener, window-state
- [x] `capabilities/default.json` : permissions FS par opération, liste blanche pour `git`
- [x] `tauri.conf.json` : CSP de production + `devCsp`, bundle, icônes générées
- [ ] Prérequis machine : Rust + MSVC Build Tools — **non installés, bloque `tauri dev`**
- [ ] Premier `npm run tauri build` (MSI / NSIS)

### Phase 1 — Moteur Core

- [x] `core/workspace/` — types + WorkspaceManager (scan, CRUD, unicité des noms)
- [x] `core/filesystem/` — interface FileSystem + TauriFileSystem + MemoryFileSystem
- [x] `core/parser/` — MDXParser (frontmatter, wiki-links, masque de code) + convertisseur
- [x] `core/graph/` — KnowledgeGraph (liens cassés, cross-workspace, orphelines)
- [x] `core/search/` — recherche full-text insensible aux accents

### Phase 2 — Frontend

- [x] `store/DocStore.ts` — Zustand multi-workspace
- [x] `WorkspaceTabs`, `Sidebar`, `SearchBar`, `BottomPanel`
- [x] `Editor` double mode : WYSIWYG (Editor.js) + Source, avec autocomplétion des `[[`
- [x] `FrontmatterPanel` — édition YAML séparée du corps du document
- [x] `Preview` — rendu MDX + composants Callout / Accordion / Toggle
- [x] `GraphView` — disposition d3-force calculée en une passe synchrone
- [x] `App.tsx` — layout complet, Ctrl+S, chargement différé des vues lourdes
- [x] Persistance des workspaces via `plugin-store` + revalidation au démarrage

### Phase 3 — Backend Serveur (distant)

- [ ] Reporté : non développé, à la demande

### Phase 4 — Historique local

- [x] `core/git/LocalGitLog.ts` — `git log` en lecture seule via `plugin-shell`
- [x] Détection du dépôt via `rev-parse --show-toplevel` (gère les sous-dossiers de monorepo)
- [x] Onglet Historique masqué si le workspace n'est pas dans un dépôt
- [x] Rafraîchissement automatique via `watch()` de `plugin-fs`

### Phase 5 — Tests & Distribution

- [x] 66 tests unitaires sur le core (parser, convertisseur, graphe, recherche, manager)
- [x] Vérification de l'UI en mode démonstration : arborescence, aperçu MDX, navigation
      cross-workspace, graphe, recherche, cycle édition → sauvegarde → relecture
- [ ] Synchronisation WYSIWYG → brouillon : **non vérifiable en environnement headless**.
      Editor.js enregistre les observateurs de mutation de chaque bloc dans un
      `requestIdleCallback`, qui ne se déclenche jamais quand la page ne compose pas de
      frames. À revérifier au premier lancement dans une vraie fenêtre.
- [ ] Tests sur un vrai dossier, puis sur un gros monorepo (nécessite la toolchain Rust)
- [ ] Build multi-plateforme, signature de code, `plugin-updater`

## Risques identifiés

| Risque | Impact | Mitigation |
|---|---|---|
| **CSP vs compilation MDX à l'exécution** | Bloquant | `@mdx-js/mdx` compile via `new Function` → impose `'unsafe-eval'` dans `script-src`. Acceptable pour du contenu local ou interne, mais à revoir si le wiki accepte du contenu non fiable : pré-compiler le MDX côté serveur, ou passer par un renderer sans `eval`. |
| **Editor.js et `style-src 'unsafe-inline'`** | Moyen | Editor.js injecte des styles inline. Autoriser `'unsafe-inline'` sur `style-src` uniquement, jamais sur `script-src`. |
| **Scope FS perdu si le dossier est déplacé ou renommé** | Moyen | Au démarrage, tester `exists()` ; si échec, marquer le workspace « indisponible » et proposer de re-sélectionner le dossier — ne jamais le supprimer silencieusement. |
| **Performance sur un gros monorepo** | Moyen | Un `readDir` récursif en JS peut ramer sur des dizaines de milliers de fichiers. Mesurer d'abord ; si ça bloque, basculer le parcours et l'indexation en commande Rust (`ignore` + `walkdir`), sans toucher au reste du core. |
| **`git` absent du PATH** | Faible | Détecter à l'ouverture du workspace ; masquer l'onglet Historique plutôt que d'échouer. |
| **Webview différente selon l'OS** | Faible | WebView2 (Windows), WKWebView (macOS), WebKitGTK (Linux). Les écarts de rendu CSS sont le seul point d'incompatibilité résiduel — à tester en phase 5. |

---

## Licences

- Tauri — MIT / Apache-2.0
- Editor.js — MIT
- React — MIT
- Zustand — MIT
- Express — MIT
- isomorphic-git — MIT
- ldapjs — MIT
