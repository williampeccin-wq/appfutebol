#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Uso: scripts/promote-production.sh <tag-ou-ref-dev>"
  echo "Exemplo: scripts/promote-production.sh v1.60.82-env-separation-real"
  exit 1
fi

REF="$1"

cd "$(dirname "$0")/.."

CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "refactor/modularizacao-profissional" ] && [ "$CURRENT_BRANCH" != "production" ]; then
  echo "Branch atual inesperada: $CURRENT_BRANCH"
  echo "Pare e confira antes de publicar."
  exit 1
fi

git status --short
if [ -n "$(git status --short)" ]; then
  echo "Working tree não está limpa. Commit/stash antes de publicar."
  exit 1
fi

git fetch origin --tags

git switch production
git pull --ff-only origin production

git checkout "$REF" -- appfutebol_run supabase .vscode scripts

scripts/use-prod.sh

grep -q "kpgghcrmbkrwpvtegcjh" appfutebol_run/env.js
grep -q "prod-supabase" appfutebol_run/env.js

git add appfutebol_run supabase .vscode scripts
git commit -m "Publica ${REF} em production"

echo
echo "Pronto para enviar production:"
echo "  git push origin production"
echo
echo "Após validar o deploy, crie a tag de produção:"
echo "  git tag ${REF}-prod"
echo "  git push origin ${REF}-prod"
