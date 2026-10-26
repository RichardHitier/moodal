# Moodal

Petite application web installable (PWA) pour tenir un journal d'humeur, de prises et de sommeil sur Android.

- **Nouvelle saisie** : humeur (déprimé → hypomane), anxiété, pensées négatives, irritabilité, fatigue, concentration, appétit, plus des notes facultatives (pensées, fantasme, déclencheur).
- **Médicaments** : liste personnelle (gardée sur le téléphone), plusieurs prises notées en un seul enregistrement.
- **Bilan du matin** : sommeil (durée, qualité), rêves oui/non et médicaments du matin à cocher, une fois par jour.
- **Historique** : graphique jour ou semaine, avec les prises en repères verticaux.
- **Données** : export CSV (notes exclues par défaut), sauvegarde et restauration JSON.

Les données restent dans le navigateur du téléphone (`localStorage`). Rien n'est envoyé à un serveur ; ce dépôt ne contient que le code.

## Installation

1. Activer GitHub Pages sur la branche `main` (Settings → Pages).
2. Ouvrir `https://richardhitier.github.io/moodal/` dans Chrome sur Android.
3. Menu ⋮ → « Ajouter à l'écran d'accueil » (ou « Installer l'application »).

Un appui long sur l'icône donne trois raccourcis : saisie, prise, bilan.

## Développement

Aucune dépendance ni étape de compilation : HTML, CSS et JavaScript.

```sh
python3 -m http.server 8000   # puis http://localhost:8000
```

À chaque nouvelle version, changer le numéro dans `version.js` : il s'affiche dans l'appli et force la mise à jour du cache sur les téléphones.
