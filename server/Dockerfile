# Cloud Run GPU base: CUDA runtime + Python. Matches the L4 GPU target from
# the plan (nvidia-l4 in the Cloud Run deploy command below).
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PORT=8080
EXPOSE 8080

# --timeout-keep-alive covers slow first-token latency on a cold GPU;
# workers=1 since a single GPU shouldn't be shared across worker processes.
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--timeout-keep-alive", "120"]
