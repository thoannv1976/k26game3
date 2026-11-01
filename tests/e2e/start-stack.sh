#!/usr/bin/env bash
# Starts the full local stack for E2E tests: Firebase emulators → seed → API (offline providers) → web (vite preview).
set -euo pipefail
cd "$(dirname "$0")/../.."
export GCP_PROJECT_ID=demo-ed FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

npx firebase emulators:start --only firestore,auth --project demo-ed > test-results/emulators.log 2>&1 &
EMU=$!
API=''
trap 'kill $EMU ${API:-} 2>/dev/null; pkill -f cloud-firestore-emulator 2>/dev/null; true' EXIT
for i in $(seq 1 90); do
  curl -sf http://127.0.0.1:9099/ >/dev/null 2>&1 && curl -sf http://127.0.0.1:8085/ >/dev/null 2>&1 && break
  sleep 1
done
npx tsx scripts/seed.mts --local --platform-admin platform@demo.edu.vn > test-results/seed.log 2>&1

PORT=8080 NODE_ENV=development RATE_LIMIT_PER_MINUTE=100000 LOG_LEVEL=warn node apps/api/dist/server.js > test-results/api.log 2>&1 &
API=$!
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8080/api/health >/dev/null && break; sleep 1; done

# Web built with the auth emulator (see playwright.config.ts) and served with the /api proxy.
npm run preview --workspace @ed/web -- --port 4173 --strictPort --host 127.0.0.1
