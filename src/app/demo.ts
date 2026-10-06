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

## Actions

<Toggle label="Rédiger la note d'architecture" defaultOn />

<Toggle label="Préparer la démo du graphe" />

Voir aussi [[idees/graphe-de-connaissances]] et [[index|la page d'accueil]].
`,

  'syntaxe-etendue.md': `---
title: Syntaxe Markdown étendue
tags: [aide]
---

# Syntaxe Markdown étendue {#syntaxe}

Tout ce que propose [le guide](https://www.markdownguide.org/extended-syntax/),
rendu par l'aperçu. Retour à l'[[index]].

## Texte

~~Barré~~, ==surligné==, H~2~O en indice, E = mc^2^ en exposant. Les adresses
deviennent des liens : https://www.markdownguide.org.

Une affirmation qui mérite une source[^source].

[^source]: Les notes de bas de page sont regroupées en fin de document.

## Listes de tâches

- [x] Lire le guide
- [ ] Cocher une case dans l'aperçu : la source est mise à jour

## Tableau

| Syntaxe | Rendu | Aligné à droite |
| :--- | :---: | ---: |
| \`~~x~~\` | ~~x~~ | 1 |
| \`==x==\` | ==x== | 22 |

## Définitions

Cobblestone
: Clone d'Obsidian pour la documentation de monorepo.

MDX
: Markdown avec des composants JSX.

## Code coloré

\`\`\`ts
// Les blocs de code sont colorés selon leur langage.
export function bonjour(nom: string): string {
  return \`Bonjour \${nom} !\`;
}
\`\`\`

### Ancre personnalisée {#ancre}

Ce titre a l'identifiant \`ancre\` : [y aller](#ancre).
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
