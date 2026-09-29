FROM node:22-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    POT_PROVIDER_SCRIPT_HOME=/opt/bgutil/server

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone --depth 1 --branch 2.0.0 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git bgutil \
    && cd /opt/bgutil/server \
    && npm ci \
    && npx tsc \
    && npm cache clean --force

WORKDIR /app
COPY requirements.txt .

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 8080

CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 120"]
