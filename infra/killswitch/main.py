"""
Budget kill-switch (see plan: Cost Controls). Triggered by a GCP Billing
Budget's Pub/Sub notification (configure the budget to publish to a topic
this function subscribes to) — when spend crosses your threshold, this sets
the Cloud Run service's max-instances to 0, disabling it without depending
on a human noticing an alert email.

Deploy (illustrative — finalize project/topic names during Phase 1 step 9):
  gcloud functions deploy budget-killswitch \
    --runtime python311 --trigger-topic billing-budget-alerts \
    --entry-point killswitch --region us-central1
"""

import base64
import json
import os

from google.cloud import run_v2

PROJECT_ID = os.environ["GCP_PROJECT_ID"]
REGION = os.environ.get("GCP_REGION", "us-central1")
SERVICE_NAME = os.environ.get("CLOUD_RUN_SERVICE", "dating-sim-backend")
SPEND_THRESHOLD_USD = float(os.environ.get("SPEND_THRESHOLD_USD", "200"))


def killswitch(event, _context):
    payload = json.loads(base64.b64decode(event["data"]).decode("utf-8"))
    cost_amount = payload.get("costAmount", 0)
    budget_amount = payload.get("budgetAmount", SPEND_THRESHOLD_USD)

    if cost_amount < budget_amount:
        print(f"Spend {cost_amount} below budget {budget_amount}, no action.")
        return

    print(f"Spend {cost_amount} crossed budget {budget_amount} — disabling Cloud Run service.")

    client = run_v2.ServicesClient()
    service_path = client.service_path(PROJECT_ID, REGION, SERVICE_NAME)
    service = client.get_service(name=service_path)
    service.template.scaling.max_instance_count = 0
    client.update_service(service=service)
