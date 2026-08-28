# Cobblestone — build de test

Merci de prendre le temps de tester. Trois choses à savoir avant de lancer, puis ce sur
quoi ton retour serait le plus utile.

---

## 1. Windows va afficher un avertissement

L'exécutable **n'est pas signé** : Windows affichera un écran bleu
« Windows a protégé votre ordinateur ».

> Cliquer sur **Informations complémentaires**, puis sur **Exécuter quand même**.

C'est attendu à ce stade — la signature de code demande un certificat qui n'a pas encore
été acheté. Si ton poste est sous une politique d'entreprise stricte (AppLocker, WDAC),
le blocage peut être total et sans contournement possible : dans ce cas, essaie
l'exécutable portable, qui passe parfois là où l'installeur échoue. Si les deux sont
bloqués, signale-le simplement, il n'y a rien à forcer.

## 2. Deux façons de lancer l'application

| | Installation | Portable |
|---|---|---|
| Fichier | `Cobblestone_x.y.z_x64-setup.exe` | `Cobblestone-portable.zip` |
| Droits administrateur | non, installation par utilisateur | non |
| Raccourci menu Démarrer | oui | non |
| Désinstallation | via Paramètres → Applications | supprimer le dossier |

Les deux versions partagent le même identifiant applicatif, donc les mêmes données dans
`%APPDATA%\local.entreprise.cobblestone` : ta liste de workspaces est commune aux deux.

## 3. L'application démarre vide — c'est normal

Il n'y a aucun contenu au premier lancement. Pour commencer :

> **+ Nouveau workspace** (en haut à gauche) → choisir un dossier contenant des fichiers
> `.mdx` ou `.md`.

N'importe quel dossier de documentation fait l'affaire : la doc d'un projet, un dossier de
notes, un sous-dossier du monorepo. Tu peux en ouvrir plusieurs en parallèle, ils
apparaîtront en onglets.

**Cobblestone n'écrit jamais dans Git.** Aucun `add`, `commit`, `push` ni création de
branche n'est déclenché sur tes dossiers. L'application lit et écrit les fichiers
directement ; tu gardes la main complète sur tes commits. Le seul appel à Git est un
`git log` en lecture, pour afficher l'historique.

---

## Ce qu'il serait utile de regarder

- **Arborescence** — création, renommage, suppression de fichiers depuis la barre latérale
- **Éditeur WYSIWYG** — le menu `/` insère titres, listes, citations, et les composants
  maison (`Callout`, `Accordion`, `Toggle`, tableau, bloc de code)
- **Vue Source** — édition directe du MDX ; taper `[[` propose les notes existantes
- **Aller-retour entre les deux modes** — c'est le point le plus délicat : ouvrir un
  fichier existant en WYSIWYG, enregistrer, puis vérifier avec `git diff` que rien n'a été
  abîmé. Tout signalement de contenu modifié ou perdu est précieux.
- **Aperçu** — rendu MDX, liens `[[wiki]]` cliquables, y compris vers un autre workspace
  via `[[Nom du workspace:page]]`
- **Graph** — carte des liens entre notes ; les liens cassés apparaissent en rouge, les
  notes que rien ne relie sont listées dans l'onglet « Orphelines » en bas
- **Recherche** — insensible aux accents, avec bascule workspace courant / tous
- **Historique** — onglet visible seulement si le dossier est dans un dépôt Git, et si
  `git` est dans ton PATH. Lecture seule.
- **Édition en parallèle** — modifier un fichier dans ton IDE pendant que Cobblestone est
  ouvert : l'arborescence et le graphe doivent se rafraîchir tout seuls

Un essai sur un **gros dossier** (plusieurs centaines de fichiers) serait particulièrement
instructif : l'indexation est en JavaScript et n'a encore jamais été mesurée à cette
échelle.

## Ce qui n'existe pas encore

- **Le mode serveur** — wiki d'entreprise, authentification LDAP, commit automatique côté
  serveur. Spécifié, non développé.
- **Signature de code**, mises à jour automatiques.
- **Thème clair** — l'interface est en sombre uniquement.

## Remonter un problème

Le plus utile : ce que tu faisais, ce que tu attendais, ce qui s'est produit.

Si l'application se fige ou affiche une erreur, **F12** (ou `Ctrl+Shift+I`) ouvre les
outils de développement : l'onglet **Console** contient en général le message précis, et
une capture d'écran de celui-ci fait gagner beaucoup de temps. L'inspecteur est
volontairement laissé actif sur ce build de test ; il sera désactivé par la suite.
