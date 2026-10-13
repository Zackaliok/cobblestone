# Cobblestone — build de test (Linux)

Merci de prendre le temps de tester. Trois choses à savoir avant de lancer, puis ce sur
quoi ton retour serait le plus utile.

---

## 1. Le paquet n'est pas signé

Comme pour la version Windows, il n'y a pas encore de signature de paquet. Sur Debian/
Ubuntu, `apt`/`dpkg` peuvent afficher un avertissement d'origine non vérifiée à
l'installation : c'est attendu à ce stade, rien à contourner.

## 2. Deux façons de lancer l'application

| | Paquet .deb | AppImage |
|---|---|---|
| Fichier | `cobblestone_x.y.z_amd64.deb` | `cobblestone_x.y.z_amd64.AppImage` |
| Droits administrateur | oui, `sudo apt install ./…deb` | non |
| Raccourci menu applications | oui | non (sauf intégration manuelle, ex. via AppImageLauncher) |
| Désinstallation | `sudo apt remove cobblestone` | supprimer le fichier |

Installation du `.deb` :

```bash
sudo apt install ./cobblestone_x.y.z_amd64.deb
```

Lancement de l'AppImage (aucune installation requise) :

```bash
chmod +x cobblestone_x.y.z_amd64.AppImage
./cobblestone_x.y.z_amd64.AppImage
```

> Si l'AppImage refuse de se lancer avec une erreur liée à FUSE, installe `libfuse2`
> (`sudo apt install libfuse2`) — requis par les AppImages sur les distributions récentes
> qui ne l'embarquent plus par défaut.

Les deux versions partagent le même identifiant applicatif, donc les mêmes données dans
`~/.local/share/local.entreprise.cobblestone` : ta liste de workspaces est commune aux deux.

### Crash ou fenêtre qui se ferme sans message

Les erreurs sont désormais écrites dans `~/.local/share/local.entreprise.cobblestone/logs/cobblestone.log`
(joins ce fichier à ton rapport de bug). Lance aussi l'AppImage depuis un terminal pour voir stderr.

Si le crash est natif (`malloc(): unaligned tcache chunk`, erreurs `EGL`/`Iris` — voir #18),
il vient du rendu WebKitGTK/Mesa et non de l'application. Essaie de désactiver
l'accélération graphique de la webview :

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./cobblestone_x.y.z_amd64.AppImage
# ou, si cela ne suffit pas :
WEBKIT_DISABLE_COMPOSITING_MODE=1 ./cobblestone_x.y.z_amd64.AppImage
```

Dis-nous si l'une de ces variables supprime le crash.

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
  maison (`Callout`, `Accordion`, tableau, bloc de code)
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
- **Signature de paquet**, mises à jour automatiques.
- **Thème clair** — l'interface est en sombre uniquement.

## Remonter un problème

Le plus utile : ce que tu faisais, ce que tu attendais, ce qui s'est produit.

Si l'application se fige ou affiche une erreur, **F12** (ou `Ctrl+Shift+I`) ouvre les
outils de développement : l'onglet **Console** contient en général le message précis, et
une capture d'écran de celui-ci fait gagner beaucoup de temps. L'inspecteur est
volontairement laissé actif sur ce build de test ; il sera désactivé par la suite.
