/**
 * Workspaces de démonstration, utilisés quand l'application tourne dans un
 * navigateur plutôt que dans Tauri (voir `platform.ts`).
 *
 * Ils servent aussi de banc d'essai : liens internes, liens cross-workspace,
 * lien cassé, composants JSX, tableau, code — tout ce que le parser et le
 * convertisseur doivent encaisser.
 */

export const DEMO_NOTES: Record<string, string> = {
  'index.mdx': `---
title: Accueil
tags: [sommaire]
---

# Accueil

Bienvenue dans **Cobblestone**. Ce workspace de démonstration tourne en mémoire :
rien n'est écrit sur le disque.

Pour ouvrir un vrai dossier, lancez l'application desktop avec \`npm run tauri dev\`.

## Par où commencer

- [[reunions/2026-08-27-kickoff|Notes du kickoff]]
- [[idees/graphe-de-connaissances]]
- [[Projet Alpha:architecture]] — lien vers un autre workspace
- [[page-inexistante]] — lien cassé, visible en rouge dans le graphe

<Callout type="info">
  Les liens \`[[entre doubles crochets]]\` sont cliquables dans l'aperçu et
  alimentent le graphe de connaissances.
</Callout>
`,

  'reunions/2026-08-27-kickoff.mdx': `---
title: Kickoff Cobblestone
tags: [réunion, projet]
---

# Kickoff Cobblestone

Participants : équipe doc, équipe plateforme.

## Décisions

1. L'application est **desktop uniquement**, sur Tauri 2.0
2. Le mode serveur est reporté
3. L'historique Git local reste en lecture seule

> Aucune action Git ne doit être déclenchée par l'outil sur un workspace local.
> Le développeur garde la main sur ses commits.

Voir aussi [[idees/graphe-de-connaissances]] et [[index|la page d'accueil]].
`,

  'idees/graphe-de-connaissances.mdx': `---
title: Graphe de connaissances
tags: [idée]
---

# Graphe de connaissances

Chaque \`[[lien]]\` crée une arête. Les notes sans aucun lien apparaissent comme
orphelines — c'est souvent le signe d'une note à rattacher ou à archiver.

| Élément | Signification |
|---|---|
| Cercle plein | Note existante |
| Cercle rouge | Lien cassé |
| Trait pointillé | Lien cross-workspace |

\`\`\`ts
const graphe = buildGraph(notes, workspaces);
console.log(graphe.nodes.length);
\`\`\`

Retour vers [[index]].
`,
};

export const DEMO_ALPHA_NOTES: Record<string, string> = {
  'architecture.mdx': `---
title: Architecture Projet Alpha
tags: [architecture]
---

# Architecture Projet Alpha

Documentation vivant directement dans le repo du projet.

<Callout type="warning">
  Cette doc est versionnée avec le code. Cobblestone n'y touche jamais à Git.
</Callout>

## Modules

- \`api/\` — service HTTP
- \`worker/\` — traitements asynchrones

Le wiki général est décrit dans [[Notes:idees/graphe-de-connaissances]].
`,

  'deploiement.mdx': `---
title: Déploiement
---

# Déploiement

Procédure en trois étapes.

1. Build
2. Migration
3. Bascule

Voir [[architecture]] pour le découpage des modules.
`,
};
