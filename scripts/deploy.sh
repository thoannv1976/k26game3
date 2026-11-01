#!/usr/bin/env bash
# Manual deployment (Cloud Shell / Claude Cowork). GitHub Actions does the same on push to main.
#   GEMINI_MODEL=gemini-3-flash-preview VERTEX_LOCATION=global bash scripts/deploy.sh
# Requires: gcloud (logged in), firebase login (or ADC), node 22. Web config in apps/web/.env.production
# (same Firebase Web App values as English City Simulator – the project and accounts are shared).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ID="${PROJECT_ID:-k26game1}"
REGION="${REGION:-asia-southeast1}"
SITE_ID="${SITE_ID:-k26-detective}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3-flash-preview}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/detective/detective-api:${TAG}"
RUNTIME_SA="detective-api@${PROJECT_ID}.iam.gserviceaccount.com"
FIREBASE="npx --yes firebase-tools@14.27.0"

[[ -f apps/web/.env.production ]] || { echo "Missing apps/web/.env.production (copy apps/web/.env.example)." >&2; exit 1; }

echo "==> Installing dependencies and running unit tests"
npm ci --no-audit --no-fund
npm run test:unit

echo "==> Building API image ${IMAGE} (Cloud Build)"
gcloud builds submit --project "${PROJECT_ID}" --config infrastructure/cloudbuild.api.yaml --substitutions "_IMAGE=${IMAGE}" .

echo "==> Deploying Cloud Run service detective-api"
gcloud run deploy detective-api --project "${PROJECT_ID}" --region "${REGION}" --image "${IMAGE}" \
  --service-account "${RUNTIME_SA}" --allow-unauthenticated \
  --memory 1Gi --cpu 1 --concurrency 40 --timeout 300 \
  --min-instances "${MIN_INSTANCES:-0}" --max-instances "${MAX_INSTANCES:-10}" \
  --set-env-vars "NODE_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},FIRESTORE_DATABASE=detective,VERTEX_LOCATION=${VERTEX_LOCATION},GEMINI_MODEL=${GEMINI_MODEL},LOG_LEVEL=info"

# Hosting calls Cloud Run without a Google identity; if the organisation blocks allUsers, disable the invoker IAM check
# (the API verifies Firebase ID tokens on every endpoint).
RUN_URL="$(gcloud run services describe detective-api --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"
if [[ "$(curl -s -o /dev/null -w '%{http_code}' "${RUN_URL}/api/health")" == "403" ]]; then
  echo "==> Public access blocked by IAM policy – disabling the Cloud Run invoker IAM check"
  gcloud run services update detective-api --project "${PROJECT_ID}" --region "${REGION}" --no-invoker-iam-check
fi
curl -fsS "${RUN_URL}/api/health" && echo

echo "==> Building web app"
npm run build --workspace @ed/web

echo "==> Firebase Hosting site ${SITE_ID}"
${FIREBASE} hosting:sites:get "${SITE_ID}" --project "${PROJECT_ID}" >/dev/null 2>&1 || ${FIREBASE} hosting:sites:create "${SITE_ID}" --project "${PROJECT_ID}" --non-interactive
${FIREBASE} target:apply hosting detective "${SITE_ID}" --project "${PROJECT_ID}" >/dev/null

echo "==> Deploying Hosting + Firestore rules/indexes for database 'detective'"
${FIREBASE} deploy --project "${PROJECT_ID}" --only hosting:detective,firestore --non-interactive

echo "==> Smoke test"
curl -fsS "https://${SITE_ID}.web.app/api/health" && echo && echo "Deployed: https://${SITE_ID}.web.app"
