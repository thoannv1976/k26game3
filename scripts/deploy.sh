#!/usr/bin/env bash
# Manual deployment of VSTEP Quest (Cloud Shell / Claude Cowork). GitHub Actions does the same on push to main.
#   GEMINI_MODEL=gemini-3-flash-preview VERTEX_LOCATION=global bash scripts/deploy.sh
# Requires: infrastructure/bootstrap.sh done once, gcloud (logged in), firebase login (or ADC), node 22.
# Web config in apps/web/.env.production (same Firebase Web App values as Game 1 – project and accounts are shared).
# Only touches Game 3 resources: Cloud Run vstep-api, Hosting site k26-vstep, Firestore database "vstep",
# Scheduler job vstep-jobs-tick.
# Optional env: FIREBASE_ACCOUNT (firebase-tools --account), MIN_INSTANCES, MAX_INSTANCES,
#   UniGame Hub (LTI 1.3, off by default): LTI_ENABLED=true LTI_HUB_URL=https://… LTI_TENANT_MAP="hubTenant=appTenant;…"
#   LTI_SECRET_NAME (Secret Manager secret holding this game's Hub secret, default unigamehub-secret-k26game3).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ID="${PROJECT_ID:-k26game1}"
REGION="${REGION:-asia-southeast1}"
SITE_ID="${SITE_ID:-k26-vstep}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3-flash-preview}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/vstep/vstep-api:${TAG}"
RUNTIME_SA="vstep-api@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SA="vstep-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
BUCKET="${BUCKET:-${PROJECT_ID}-vstep-audio}"
FIREBASE="npx --yes firebase-tools@14.27.0"
FB_ACCOUNT=(); [[ -n "${FIREBASE_ACCOUNT:-}" ]] && FB_ACCOUNT=(--account "${FIREBASE_ACCOUNT}")

[[ -f apps/web/.env.production ]] || { echo "Missing apps/web/.env.production (copy apps/web/.env.example)." >&2; exit 1; }

# D4 (optional): read-only learning evidence from Game 1 and Game 2 (their Cloud Run URLs, if deployed).
PEER_CITY_URL="${PEER_CITY_URL:-$(gcloud run services describe ecs-api --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)' 2>/dev/null || true)}"
PEER_DETECTIVE_URL="${PEER_DETECTIVE_URL:-$(gcloud run services describe detective-api --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)' 2>/dev/null || true)}"

echo "==> Installing dependencies and running unit tests"
npm ci --no-audit --no-fund
# Unit tests use their own config; do not leak the deploy-time LTI settings into them.
env -u LTI_ENABLED -u LTI_HUB_URL -u LTI_TENANT_MAP -u LTI_GAME_SECRET npm run test:unit

echo "==> Building API image ${IMAGE} (Cloud Build)"
gcloud builds submit --project "${PROJECT_ID}" --config infrastructure/cloudbuild.api.yaml --substitutions "_IMAGE=${IMAGE}" .

ENV_VARS="NODE_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},FIRESTORE_DATABASE=vstep,VERTEX_LOCATION=${VERTEX_LOCATION},GEMINI_MODEL=${GEMINI_MODEL},AUDIO_BUCKET=${BUCKET},JOBS_INVOKERS=${SCHEDULER_SA},PEER_CITY_URL=${PEER_CITY_URL},PEER_DETECTIVE_URL=${PEER_DETECTIVE_URL},LOG_LEVEL=info"
# UniGame Hub (LTI 1.3). Off unless LTI_ENABLED=true; the shared secret lives in Secret Manager.
ENV_VARS="${ENV_VARS},LTI_ENABLED=${LTI_ENABLED:-false},LTI_HUB_URL=${LTI_HUB_URL:-},LTI_TENANT_MAP=${LTI_TENANT_MAP:-}"
LTI_SECRET_ARGS=()
if [[ "${LTI_ENABLED:-false}" == "true" ]]; then LTI_SECRET_ARGS=(--update-secrets "LTI_GAME_SECRET=${LTI_SECRET_NAME:-unigamehub-secret-k26game3}:latest"); fi

echo "==> Deploying Cloud Run service vstep-api"
gcloud run deploy vstep-api --project "${PROJECT_ID}" --region "${REGION}" --image "${IMAGE}" \
  --service-account "${RUNTIME_SA}" --allow-unauthenticated \
  --memory 1Gi --cpu 1 --concurrency 40 --timeout 300 \
  --min-instances "${MIN_INSTANCES:-0}" --max-instances "${MAX_INSTANCES:-10}" \
  --set-env-vars "${ENV_VARS}" \
  ${LTI_SECRET_ARGS[@]+"${LTI_SECRET_ARGS[@]}"}

# Hosting calls Cloud Run without a Google identity; if the organisation blocks allUsers, disable the invoker IAM check
# (the API verifies Firebase ID tokens on every /api endpoint and OIDC tokens on /internal/jobs).
RUN_URL="$(gcloud run services describe vstep-api --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"
if [[ "$(curl -s -o /dev/null -w '%{http_code}' "${RUN_URL}/api/health")" == "403" ]]; then
  echo "==> Public access blocked by IAM policy – disabling the Cloud Run invoker IAM check"
  gcloud run services update vstep-api --project "${PROJECT_ID}" --region "${REGION}" --no-invoker-iam-check
fi
echo "==> Scheduler audience = ${RUN_URL}"
gcloud run services update vstep-api --project "${PROJECT_ID}" --region "${REGION}" --update-env-vars "JOBS_AUDIENCE=${RUN_URL}" >/dev/null
curl -fsS "${RUN_URL}/api/health" && echo

echo "==> Cloud Scheduler job vstep-jobs-tick (every 5 minutes: exam timeouts, background grading, championship closing)"
gcloud run services add-iam-policy-binding vstep-api --project "${PROJECT_ID}" --region "${REGION}" --member="serviceAccount:${SCHEDULER_SA}" --role=roles/run.invoker >/dev/null 2>&1 || true
SCHED_ARGS=(--project "${PROJECT_ID}" --location "${REGION}" --schedule "*/5 * * * *" --time-zone "Asia/Ho_Chi_Minh" --uri "${RUN_URL}/internal/jobs/tick" --http-method POST --oidc-service-account-email "${SCHEDULER_SA}" --oidc-token-audience "${RUN_URL}" --attempt-deadline 300s)
if gcloud scheduler jobs describe vstep-jobs-tick --project "${PROJECT_ID}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http vstep-jobs-tick "${SCHED_ARGS[@]}" >/dev/null
else
  gcloud scheduler jobs create http vstep-jobs-tick "${SCHED_ARGS[@]}" >/dev/null
fi

echo "==> Building web app"
npm run build --workspace @vq/web

echo "==> Firebase Hosting site ${SITE_ID}"
${FIREBASE} hosting:sites:get "${SITE_ID}" --project "${PROJECT_ID}" ${FB_ACCOUNT[@]+"${FB_ACCOUNT[@]}"} >/dev/null 2>&1 || \
  ${FIREBASE} hosting:sites:create "${SITE_ID}" --project "${PROJECT_ID}" --non-interactive ${FB_ACCOUNT[@]+"${FB_ACCOUNT[@]}"}
${FIREBASE} target:apply hosting vstep "${SITE_ID}" --project "${PROJECT_ID}" ${FB_ACCOUNT[@]+"${FB_ACCOUNT[@]}"} >/dev/null

echo "==> Deploying Hosting + Firestore rules/indexes for database 'vstep'"
${FIREBASE} deploy --project "${PROJECT_ID}" --only hosting:vstep,firestore --non-interactive ${FB_ACCOUNT[@]+"${FB_ACCOUNT[@]}"}

echo "==> Smoke test"
curl -fsS "https://${SITE_ID}.web.app/api/health" && echo && echo "Deployed: https://${SITE_ID}.web.app"
