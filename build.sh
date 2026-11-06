#!/bin/sh
# Builds the static GitHub Pages site into _site/.
# The two HTML files are Claude artifacts (no <!doctype>/<head>); wrap them in a full document here.
set -e
cd "$(dirname "$0")"
rm -rf _site && mkdir -p _site
SITE=https://raven-young.github.io/azimut/
OG_TITLE='Azimut — Fenêtre ouverte sur les professions'
DESC='Explore les formations et 248 métiers en Suisse romande, trouve ta voie après l’école obligatoire et les places d’apprentissage dans le canton de Vaud.'
wrap() {
  { printf '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    # Link previews (WhatsApp, Telegram, iMessage…): without these they show the first text found, i.e. the CSS.
    printf '<meta name="description" content="%s">\n' "$DESC"
    printf '<meta property="og:type" content="website">\n<meta property="og:locale" content="fr_CH">\n<meta property="og:site_name" content="Azimut">\n'
    printf '<meta property="og:title" content="%s">\n<meta property="og:description" content="%s">\n<meta property="og:url" content="%s%s">\n' "$OG_TITLE" "$DESC" "$SITE" "$3"
    printf '<meta name="twitter:card" content="summary">\n'
    cat "$1"
    printf '\n</html>\n'; } > "_site/$2"
}
wrap fenetre-ouverte-mindmap.html index.html ''
wrap fenetre-ouverte-light.html clair.html clair.html
cp -R img _site/img
touch _site/.nojekyll
echo "Site built in _site/"
