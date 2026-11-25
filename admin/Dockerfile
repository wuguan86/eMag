FROM python:3.13-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SERVICE_LOG_DIRECTORY=/app/logs

COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt \
    && adduser --disabled-password --gecos '' appuser \
    && mkdir -p /app/logs && chown appuser:appuser /app/logs
COPY app ./app

USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).close()"]
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
