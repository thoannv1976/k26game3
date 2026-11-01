#!/usr/bin/env bash
# One-time Google Cloud setup for English Detective inside the SHARED project of the K26 games (default: k26game1).
# Prerequisite: English City Simulator's infrastructure/bootstrap.sh has already run in this project
# (APIs enabled, Firebase added, Authentication enabled). This script only adds what Game 2 needs.
#   bash infrastructure/bootstrap.sh
# Env: PROJECT_ID (k26game1) REGION (asia-southeast1) GITHUB_REPO (thoannv1976/k26game2) SITE_ID (k26-detective)
# Idempotent: re-running skips existing resources.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-k26game1}"
REGION="${REGION:-asia-southeast1}"
GITHUB_REPO="${GITHUB_REPO:-thoannv1976/k26game2}"
DATABASE="${DATABASE:-detective}"
AR_REPO="detective"
RUNTIME_SA="detective-api"
DEPLOYER_SA="gh-detective-deployer"
POOL="github"
PROVIDER="github-oidc-detective"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

gcloud config set project "${PROJECT_ID}" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

say "Enabling APIs (no-op if Game 1 already did it)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com \
  firebase.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com identitytoolkit.googleapis.com \
  aiplatform.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com serviceusage.googleapis.com logging.googleapis.com

say "Firestore database '${DATABASE}' (Native mode, ${REGION}) – separate from English City Simulator's (default) database"
if gcloud firestore databases describe --database="${DATABASE}" >/dev/null 2>&1; then
  echo "Database ${DATABASE} already exists"
else
  gcloud firestore databases create --database="${DATABASE}" --location="${REGION}" --type=firestore-native
fi

say "Artifact Registry repository ${AR_REPO}"
gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "${AR_REPO}" --repository-format=docker --location="${REGION}" --description="English Detective images"

say "Runtime service account ${RUNTIME_EMAIL} (access limited to the '${DATABASE}' database)"
gcloud iam service-accounts describe "${RUNTIME_EMAIL}" >/dev/null 2>&1 || gcloud iam service-accounts create "${RUNTIME_SA}" --display-name="English Detective API (Cloud Run runtime)"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${RUNTIME_EMAIL}" --role=roles/datastore.user \
  --condition="expression=resource.name.startsWith(\"projects/${PROJECT_ID}/databases/${DATABASE}\"),title=detective-database-only,description=English Detective may only use its own database" >/dev/null
for role in roles/aiplatform.user roles/firebaseauth.admin roles/serviceusage.serviceUsageConsumer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${RUNTIME_EMAIL}" --role="${role}" --condition=None >/dev/null
done

say "Deployer service account ${DEPLOYER_EMAIL} + Workload Identity Federation for ${GITHUB_REPO}"
gcloud iam service-accounts describe "${DEPLOYER_EMAIL}" >/dev/null 2>&1 || gcloud iam service-accounts create "${DEPLOYER_SA}" --display-name="GitHub Actions deployer (English Detective)"
for role in roles/run.admin roles/artifactregistry.writer roles/firebasehosting.admin roles/firebaserules.admin roles/datastore.indexAdmin roles/serviceusage.serviceUsageConsumer roles/firebase.viewer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${DEPLOYER_EMAIL}" --role="${role}" --condition=None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_EMAIL}" --member="serviceAccount:${DEPLOYER_EMAIL}" --role=roles/iam.serviceAccountUser >/dev/null
gcloud iam workload-identity-pools describe "${POOL}" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "${POOL}" --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe "${PROVIDER}" --location=global --workload-identity-pool="${POOL}" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER}" --location=global --workload-identity-pool="${POOL}" \
    --display-name="GitHub OIDC (k26game2)" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'"
gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_EMAIL}" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null

say "Cloud Build permissions (for scripts/deploy.sh)"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for role in roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${COMPUTE_SA}" --role="${role}" --condition=None >/dev/null 2>&1 || true
done

say "Done. GitHub repository variables for ${GITHUB_REPO} (Settings → Environments → development):"
cat <<OUT
  GCP_PROJECT_ID = ${PROJECT_ID}
  GCP_REGION     = ${REGION}
  WIF_PROVIDER   = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}
  DEPLOYER_SA    = ${DEPLOYER_EMAIL}
  RUNTIME_SA     = ${RUNTIME_EMAIL}
  HOSTING_SITE   = ${SITE_ID:-k26-detective}
  GEMINI_MODEL   = the Gemini Flash model that works for English City Simulator (e.g. gemini-3-flash-preview)
  VERTEX_LOCATION= the location that works with that model (e.g. global)
  VITE_FIREBASE_API_KEY / VITE_FIREBASE_AUTH_DOMAIN / VITE_FIREBASE_APP_ID = same Web App config as English City Simulator
Remaining manual step (Firebase Console → Authentication → Settings → Authorized domains):
  add ${SITE_ID:-k26-detective}.web.app and ${SITE_ID:-k26-detective}.firebaseapp.com
OUT
