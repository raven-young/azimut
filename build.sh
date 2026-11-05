#!/bin/sh
# Builds the static GitHub Pages site into _site/.
# The two HTML files are Claude artifacts (no <!doctype>/<head>); wrap them in a full document here.
set -e
cd "$(dirname "$0")"
rm -rf _site && mkdir -p _site
wrap() {
  { printf '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    cat "$1"
    printf '\n</html>\n'; } > "_site/$2"
}
wrap fenetre-ouverte-mindmap.html index.html
wrap fenetre-ouverte-light.html clair.html
cp -R img _site/img
touch _site/.nojekyll
echo "Site built in _site/"
