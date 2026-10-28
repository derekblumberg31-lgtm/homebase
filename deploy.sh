#!/bin/sh
# Publish Homebase to https://homebase-derek.netlify.app
# Builds dist/ (typecheck + tests + Vite + service worker) and deploys it. Installed devices pick up
# the new version the next time Homebase is opened online.
# First time on a new Mac: npx netlify-cli login
set -e
cd "$(dirname "$0")"
SITE=homebase-derek
[ -d node_modules ] || npm install
npm test
npm run build
if ! npx --yes netlify-cli sites:list --json | grep -q "\"name\": *\"$SITE\""; then
  npx --yes netlify-cli sites:create --name "$SITE"
fi
npx --yes netlify-cli deploy --prod --no-build --dir dist --site "$SITE"
echo "Published to https://$SITE.netlify.app"
