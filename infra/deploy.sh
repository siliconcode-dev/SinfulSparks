#!/usr/bin/env bash
# Builds and deploys the backend to Cloud Run (see plan pivot: LLM/STT/TTS
# all run via Groq's hosted API now, not a self-hosted GPU — no --gpu flags,
# no GPU quota needed, plain CPU Cloud Run). Run from repo root:
#   bash infra/deploy.sh
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="us-central1"
REPO="dating-sim-repo"
IMAGE="us-central1-docker.pkg.dev/${PROJECT_ID}/${REPO}/backend:latest"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:?Set ALLOWED_ORIGINS to your Vercel production URL(s), comma-separated}"

gcloud config set project "$PROJECT_ID"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com --quiet

gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION"

docker build -t "$IMAGE" server/
docker push "$IMAGE"

gcloud run deploy dating-sim-backend \
  --image "$IMAGE" \
  --region "$REGION" \
  --min-instances 0 --max-instances 3 \
  --timeout 60 \
  --allow-unauthenticated \
  --set-env-vars "ALLOWED_ORIGINS=${ALLOWED_ORIGINS},SUPABASE_URL=${SUPABASE_URL:?Set SUPABASE_URL},SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY},GROQ_API_KEY=${GROQ_API_KEY:?Set GROQ_API_KEY},GROQ_API_KEY_FALLBACK=${GROQ_API_KEY_FALLBACK:-}"

echo "Deployed. Service URL:"
gcloud run services describe dating-sim-backend --region "$REGION" --format='value(status.url)'
