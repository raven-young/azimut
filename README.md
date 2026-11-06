# Azimut — Fenêtre ouverte sur les professions

Explorateur interactif des voies de formation et des métiers en Suisse romande, d'après *Fenêtre ouverte sur les professions* (CSFO, édition 2026, selon René Zihlmann).

**Site :** https://raven-young.github.io/azimut/

- `index.html` (source : `fenetre-ouverte-mindmap.html`) : version principale, thème selon le système
- `clair.html` (source : `fenetre-ouverte-light.html`) : version en thème clair par défaut

## Contenu

- **Parcours de formation** : les voies après l'école obligatoire (apprentissage, ECG, gymnase…), avec un quiz « Trouve ta voie » (VG/VP et niveaux)
- **Métiers** : 248 professions dans 22 domaines, classées par 9 centres d'intérêt, filtrables par durée (AFP, CFC 3 ou 4 ans)
- **Trouver place d’apprentissage** : carte de la Suisse (seul Vaud est cliquable) puis carte du canton de Vaud avec les places d’apprentissage par lieu de formation, filtrables par métier, entreprise ou domaine professionnel (22 domaines groupés par centre d’intérêt)
- **Espace conseiller·ère** : liens orientation.ch utiles en entretien

## Données mises à jour chaque jour

Chaque matin (~5h30 UTC), le workflow lit les pages publiques d’orientation.ch dans un navigateur sans interface (`scripts/update-places.mjs`) :

- `places.json` : nombre de places en Suisse et dans le canton de Vaud pour chaque métier (fiche métier)
- `vd-places.json` : toutes les places vaudoises (entreprise, métier, localité, fiche orientation.ch d’origine pour le domaine), géolocalisées par NPA avec l’API publique de swisstopo (geo.admin.ch)

Si la lecture échoue, les données de la veille sont conservées. Les fichiers ne sont pas versionnés : ils sont générés à chaque déploiement. Hors du site (artefact claude.ai), les chiffres intégrés au 5 novembre 2026 s’affichent et la carte renvoie vers le site.

Les contours (cantons, communes vaudoises, lacs) viennent de `swiss-maps` 2025 (OFS), préprojetés par `scripts/build-geo.mjs`.

## Développement

Les deux fichiers HTML sont autonomes (D3 chargé depuis un CDN, images dans `img/`).

```sh
npm install && npx playwright install chromium-headless-shell
./build.sh                         # génère _site/ (efface les données)
npm run places                     # puis rafraîchit _site/places.json et _site/vd-places.json (~10 min)
python3 -m http.server -d _site    # aperçu sur http://localhost:8000
```

Chaque push sur `main` redéploie le site via GitHub Actions (`.github/workflows/pages.yml`).
