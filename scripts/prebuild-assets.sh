#!/bin/sh
# Used by the Vercel preview deploy, which uploads source without binaries.
# Regenerates the PWA icons and copies the self-hosted fonts into place.
set -e
node scripts/generate-icons.mjs
mkdir -p src/app/fonts
cp node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2 src/app/fonts/bricolage-grotesque.woff2
cp node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2 src/app/fonts/figtree.woff2
