# Cobblestone

Application desktop (Tauri 2.0) de gestion de documentation MDX : notes personnelles,
documentation de monorepo et wiki, réunies dans une même interface via des **workspaces**.

**TRES LEGER EN CONSOMMATION DE MEMOIRE VIVE**

Spécification complète : [PLAN.md](./PLAN.md).

---

## État actuel

Le **mode local** est implémenté de bout en bout. Le **mode serveur** (wiki d'entreprise,
Express + LDAP + auto-commit Git) est spécifié dans `PLAN.md` mais volontairement non
développé pour l'instant.

| Fonctionnalité | État |
|---|---|
| Workspaces locaux multiples, persistés entre deux lancements | ✅ |
| Arborescence, création, renommage, suppression de `.mdx` / `.md` | ✅ |
| Liens `[[wiki-link]]`, y compris cross-workspace `[[Workspace:page]]` | ✅ |
| Éditeur WYSIWYG (Editor.js) + éditeur source, aller-retour sans perte | ✅ |
| Aperçu MDX avec `Callout`, `Accordion`, `Toggle` et liens cliquables | ✅ |
| Graphe de connaissances (workspace / global), liens cassés, orphelines | ✅ |
| Recherche full-text insensible aux accents | ✅ |
| Historique Git local, en lecture seule | ✅ |
| Rafraîchissement automatique quand les fichiers changent sur le disque | ✅ |
| Mode serveur (wiki, LDAP, auto-commit) | ⛔ non développé |

---

## Prérequis

L'application a besoin de la toolchain Rust pour être compilée :

- **Rust** (via [rustup](https://rustup.rs))
- **Microsoft C++ Build Tools** sous Windows — la cible `x86_64-pc-windows-msvc` de Rust
  délègue l'édition de liens à `link.exe`, fourni uniquement par le workload C++
- **WebView2** — déjà présent sur Windows 11

```bash
winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
```

```bash
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

> Le bloc `--override` n'est pas optionnel. Sans lui, winget installe la coquille du
> Visual Studio Installer **sans aucun workload** : `link.exe` reste absent et
> `npm run tauri dev` échoue sur `error: linker 'link.exe' not found`.
> Comptez ~4 Go et plusieurs minutes. Rouvrez le terminal ensuite.

Vérification :

```bash
rustc --version && where link.exe
```

`git` doit être dans le `PATH` pour que l'onglet Historique apparaisse. S'il est absent,
l'onglet est simplement masqué.

---

## Lancer l'application

```bash
npm install
```

```bash
npm run tauri dev
```

### Sans Rust : mode démonstration

`npm run dev` seul ouvre la même interface dans un navigateur, avec deux workspaces
**en mémoire** (`src/app/demo.ts`). Utile pour travailler l'UI sans compiler Rust.
Aucun accès disque n'y est possible : ouvrir un vrai dossier exige l'application desktop.

```bash
npm run dev
```

---

## Vérifications

```bash
npm run typecheck && npm test && npm run build
```

---

## Structure

```
src/core/      Moteur : TypeScript pur, sans dépendance à React ni au DOM
               (workspace, filesystem, parser, graph, search, git)
src/app/       Interface React : store Zustand, composants, hooks
src-tauri/     Coquille native Rust : plugins uniquement, aucune logique métier
```

Le découpage n'est pas cosmétique : `src/core/` est testable en Node sans Tauri
(`npm test` couvre le parser, le convertisseur, le graphe, la recherche et le manager
de workspaces), et `src-tauri/` reste assez petit pour être audité d'un coup d'œil.

---

## Sécurité

- **Aucun dossier n'est accessible par défaut.** Les permissions `fs:allow-*` déclarées
  dans `src-tauri/capabilities/default.json` autorisent l'*opération*, jamais le *chemin*.
  Un dossier ne devient lisible que lorsque l'utilisateur le choisit via le sélecteur
  système ; `tauri-plugin-persisted-scope` restaure ensuite cette autorisation au
  démarrage suivant.
- **`git` est appelé via une liste blanche.** Seules les formes exactes `git rev-parse
  --show-toplevel` et `git log …` sont exécutables, avec des arguments validés par regex
  côté Rust. Le frontend ne peut pas lancer autre chose.
- **Cobblestone n'écrit jamais dans Git** sur un workspace local : ni `add`, ni `commit`,
  ni `push`, ni création de branche.
- **La CSP autorise `'unsafe-eval'`** : `@mdx-js/mdx` compile l'aperçu dans la webview via
  `new Function`. Acceptable pour de la documentation locale ou interne — à revoir avant
  d'afficher du MDX rédigé par des tiers non fiables, où il faudrait le pré-compiler.

---

## Licences

Tauri (MIT / Apache-2.0), React, Editor.js, Zustand, MDX, d3, js-yaml — MIT.
