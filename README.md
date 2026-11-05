# Azimut — Fenêtre ouverte sur les professions

Explorateur interactif des voies de formation et des métiers en Suisse romande, d'après *Fenêtre ouverte sur les professions* (CSFO, édition 2026, selon René Zihlmann).

**Site :** https://raven-young.github.io/azimut/

- `index.html` (source : `fenetre-ouverte-mindmap.html`) : version principale, thème selon le système
- `clair.html` (source : `fenetre-ouverte-light.html`) : version en thème clair par défaut

## Contenu

- **Parcours de formation** : les voies après l'école obligatoire (apprentissage, ECG, gymnase…), avec un quiz « Trouve ta voie » (VG/VP et niveaux)
- **Métiers** : 248 professions dans 22 domaines, classées par 9 centres d'intérêt, filtrables par durée (AFP, CFC 3 ou 4 ans)
- **Espace conseiller·ère** : liens orientation.ch utiles en entretien

## Développement

Les deux fichiers HTML sont autonomes (D3 chargé depuis un CDN, images dans `img/`).

```sh
./build.sh                         # génère _site/
python3 -m http.server -d _site    # aperçu sur http://localhost:8000
```

Chaque push sur `main` redéploie le site via GitHub Actions (`.github/workflows/pages.yml`).
