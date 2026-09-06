# No GPU/CUDA needed — LLM/STT/TTS all run via Groq's hosted API (see plan
# pivot). A plain Python slim image is enough now, and Cloud Run can run
# this on CPU-only, which is dramatically cheaper and needs no GPU quota.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PORT=8080
EXPOSE 8080

CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]
