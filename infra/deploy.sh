#!/usr/bin/env bash
# Builds and deploys the backend to Cloud Run with GPU (see plan: Build Order
# Phase 1 step 1-2). Run from repo root: bash infra/deploy.sh
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="us-central1"
REPO="dating-sim-repo"
IMAGE="us-central1-docker.pkg.dev/${PROJECT_ID}/${REPO}/backend:latest"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:?Set ALLOWED_ORIGIN to your Vercel production URL}"

gcloud config set project "$PROJECT_ID"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com --quiet

gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION"

docker build -t "$IMAGE" server/
docker push "$IMAGE"

gcloud run deploy dating-sim-backend \
  --image "$IMAGE" \
  --region "$REGION" \
  --gpu 1 --gpu-type nvidia-l4 \
  --min-instances 0 --max-instances 3 \
  --timeout 300 \
  --no-cpu-throttling \
  --allow-unauthenticated \
  --set-env-vars "ALLOWED_ORIGIN=${ALLOWED_ORIGIN},SUPABASE_URL=${SUPABASE_URL:?Set SUPABASE_URL},SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"

echo "Deployed. Service URL:"
gcloud run services describe dating-sim-backend --region "$REGION" --format='value(status.url)'
