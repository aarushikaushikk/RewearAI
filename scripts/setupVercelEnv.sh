#!/usr/bin/env bash
# One-time setup: copies .env.local into the linked Vercel project's Preview and Production
# environments, and stores the deploy IDs and domains in GitHub for the CI/CD pipeline.
# Values are piped from .env.local and never printed. See docs/CI_CD.md.
#
# Usage: bash scripts/setupVercelEnv.sh <production-domain> <preview-domain>
#   e.g. bash scripts/setupVercelEnv.sh rewear-ai.vercel.app rewear-ai-preview.vercel.app
# Run `npx vercel@65.2.0 login` and `npx vercel@65.2.0 link` first.
set -euo pipefail

VERCEL="npx --yes vercel@65.2.0"
ENV_FILE=.env.local
PROD_DB=rewear-prod

production_domain="${1:?Usage: setupVercelEnv.sh <production-domain> <preview-domain>}"
preview_domain="${2:?Usage: setupVercelEnv.sh <production-domain> <preview-domain>}"

[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found." >&2; exit 1; }
[ -f .vercel/project.json ] || { echo "Run '$VERCEL link' first." >&2; exit 1; }

# Reads one value from .env.local without sourcing the file.
read_env() {
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'
}

add_env() {
  local name="$1" environment="$2" value="$3"
  if [ -z "$value" ]; then
    echo "  skip $name ($environment): empty in $ENV_FILE"
    return
  fi
  printf '%s' "$value" | $VERCEL env add "$name" "$environment" --force --yes > /dev/null
  echo "  set  $name ($environment)"
}

preview_uri=$(read_env MONGODB_URI)
# Same cluster and user, but the production database: .../rewear?... becomes .../rewear-prod?...
production_uri=$(printf '%s' "$preview_uri" | sed -E "s#(@[^/]+/)[^?]*#\1$PROD_DB#")
if [ -z "$preview_uri" ] || [ "$production_uri" = "$preview_uri" ]; then
  echo "MONGODB_URI in $ENV_FILE must include a database path, e.g. .../rewear?retryWrites=true" >&2
  exit 1
fi

shared=(CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET CRON_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET)

for environment in preview production; do
  echo "Vercel $environment:"
  if [ "$environment" = production ]; then
    add_env MONGODB_URI "$environment" "$production_uri"
    add_env APP_ORIGIN "$environment" "https://$production_domain"
  else
    add_env MONGODB_URI "$environment" "$preview_uri"
    add_env APP_ORIGIN "$environment" "https://$preview_domain"
  fi
  add_env TRUST_PROXY "$environment" true
  add_env MONGOMS_DISABLE_POSTINSTALL "$environment" 1
  for name in "${shared[@]}"; do
    add_env "$name" "$environment" "$(read_env "$name")"
  done
done

echo "GitHub:"
node -p "require('./.vercel/project.json').orgId" | gh secret set VERCEL_ORG_ID
node -p "require('./.vercel/project.json').projectId" | gh secret set VERCEL_PROJECT_ID
gh variable set PREVIEW_DOMAIN --body "$preview_domain"
gh variable set PRODUCTION_URL --body "https://$production_domain"
echo "  set  VERCEL_ORG_ID, VERCEL_PROJECT_ID, PREVIEW_DOMAIN, PRODUCTION_URL"

echo
echo "Still to do by hand (docs/CI_CD.md): gh secret set VERCEL_TOKEN, Deployment Protection, Google redirect URIs."
