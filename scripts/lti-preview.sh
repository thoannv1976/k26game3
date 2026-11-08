#!/usr/bin/env bash
# Deploys a PREVIEW of VSTEP Quest with UniGame Hub (LTI) sign-in enabled, without touching the live service:
# a separate Cloud Run service (vstep-api-lti-preview) + a Firebase Hosting preview channel "lti" on site k26-vstep.
# NOTE: the preview shares the production Firestore database "vstep" and the Firebase Auth of PROJECT_ID
# (accounts are shared with Games 1 and 2). The live Cloud Scheduler job only calls vstep-api (LTI off there), so
# grades of preview attempts are sent when the results page grades them (the usual path), not by the background job.
#
#   bash scripts/lti-preview.sh
#
# Env: PROJECT_ID (default k26game1), REGION, SITE_ID (default k26-vstep), HUB_URL, HUB_PROJECT (holds game-secret-k26game3),
#      LTI_TENANT_MAP (default aiedu-local=demo-university), LTI_SECRET_NAME (default unigamehub-secret-k26game3),
#      GEMINI_MODEL (default gemini-3-flash-preview), VERTEX_LOCATION (default global), GCLOUD_ACCOUNT (project owner account)
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ID="${PROJECT_ID:-k26game1}"
REGION="${REGION:-asia-southeast1}"
SITE_ID="${SITE_ID:-k26-vstep}"
HUB_URL="${HUB_URL:-https://unigame-hub-423573033950.asia-southeast1.run.app}"
HUB_PROJECT="${HUB_PROJECT:-gamehub-514101}"
LTI_TENANT_MAP="${LTI_TENANT_MAP:-aiedu-local=demo-university}"
LTI_SECRET_NAME="${LTI_SECRET_NAME:-unigamehub-secret-k26game3}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3-flash-preview}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
ACCOUNT_ARGS=(); [[ -n "${GCLOUD_ACCOUNT:-}" ]] && ACCOUNT_ARGS=(--account "${GCLOUD_ACCOUNT}")
SA="vstep-api@${PROJECT_ID}.iam.gserviceaccount.com"
TAG="lti-$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/vstep/vstep-api:${TAG}"
FIREBASE="npx --yes firebase-tools@14.27.0"

[[ -f apps/web/.env.production ]] || { echo "Missing apps/web/.env.production (copy apps/web/.env.example)." >&2; exit 1; }

echo "==> 1/6 Shared secret for result tokens (copied from the Hub project, never printed)"
if ! gcloud secrets describe "${LTI_SECRET_NAME}" --project "${PROJECT_ID}" "${ACCOUNT_ARGS[@]}" >/dev/null 2>&1; then
  gcloud secrets versions access latest --secret game-secret-k26game3 --project "${HUB_PROJECT}" | tr -d '\r\n' |
    gcloud secrets create "${LTI_SECRET_NAME}" --project "${PROJECT_ID}" "${ACCOUNT_ARGS[@]}" --replication-policy automatic --data-file=-
fi

echo "==> 2/6 IAM: runtime SA may read the secret and sign Firebase custom tokens (signBlob on itself)"
gcloud secrets add-iam-policy-binding "${LTI_SECRET_NAME}" --project "${PROJECT_ID}" "${ACCOUNT_ARGS[@]}" \
  --member "serviceAccount:${SA}" --role roles/secretmanager.secretAccessor >/dev/null
gcloud iam service-accounts add-iam-policy-binding "${SA}" --project "${PROJECT_ID}" "${ACCOUNT_ARGS[@]}" \
  --member "serviceAccount:${SA}" --role roles/iam.serviceAccountTokenCreator >/dev/null

echo "==> 3/6 Build API image ${IMAGE} (Cloud Build)"
gcloud builds submit --project "${PROJECT_ID}" "${ACCOUNT_ARGS[@]}" --config infrastructure/cloudbuild.api.yaml --substitutions "_IMAGE=${IMAGE}" .

PEER_CITY_URL="${PEER_CITY_URL:-$(gcloud run services describe ecs-api --project "${PROJECT_ID}" "${ACCOUNT_ARGS[@]}" --region "${REGION}" --format='value(status.url)' 2>/dev/null || true)}"
PEER_DETECTIVE_URL="${PEER_DETECTIVE_URL:-$(gcloud run services describe detective-api --project "${PROJECT_ID}" "${ACCOUNT_ARGS[@]}" --region "${REGION}" --format='value(status.url)' 2>/dev/null || true)}"

echo "==> 4/6 Deploy preview service vstep-api-lti-preview (same settings as vstep-api + LTI; no scheduler jobs)"
gcloud run deploy vstep-api-lti-preview --project "${PROJECT_ID}" "${ACCOUNT_ARGS[@]}" --region "${REGION}" --image "${IMAGE}" --quiet \
  --service-account "${SA}" --allow-unauthenticated \
  --memory 1Gi --cpu 1 --concurrency 40 --timeout 300 --min-instances 0 --max-instances 3 \
  --set-env-vars "^|^NODE_ENV=production|GCP_PROJECT_ID=${PROJECT_ID}|FIRESTORE_DATABASE=vstep|VERTEX_LOCATION=${VERTEX_LOCATION}|GEMINI_MODEL=${GEMINI_MODEL}|AUDIO_BUCKET=${PROJECT_ID}-vstep-audio|PEER_CITY_URL=${PEER_CITY_URL}|PEER_DETECTIVE_URL=${PEER_DETECTIVE_URL}|LOG_LEVEL=info|LTI_ENABLED=true|LTI_HUB_URL=${HUB_URL}|LTI_GAME_ID=k26game3|LTI_TENANT_MAP=${LTI_TENANT_MAP}" \
  --update-secrets "LTI_GAME_SECRET=${LTI_SECRET_NAME}:latest"

echo "==> 5/6 Build web (reads apps/web/.env.production)"
npm run build --workspace @vq/web

echo "==> 6/6 Hosting preview channel 'lti' (7 days) on ${SITE_ID} with /api -> vstep-api-lti-preview"
${FIREBASE} target:apply hosting vstep "${SITE_ID}" --project "${PROJECT_ID}" ${GCLOUD_ACCOUNT:+--account "$GCLOUD_ACCOUNT"} >/dev/null
${FIREBASE} hosting:channel:deploy lti --only vstep --config firebase.preview.json --project "${PROJECT_ID}" --expires 7d ${GCLOUD_ACCOUNT:+--account "$GCLOUD_ACCOUNT"}
echo "Point the Hub at the channel URL above: GAME_LAUNCH_URL_K26GAME3=https://<channel-url>/lti-launch"
