# syntax=docker/dockerfile:1.7
# ---- 1. build the React app ------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig*.json eslint.config.js ./
COPY public ./public
COPY content ./content
COPY src ./src
RUN npm run build

# ---- 2. runtime -------------------------------------------------------------------------------
FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    ENVIRONMENT=production PYTHONPATH=/app/backend/src
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend ./backend
COPY content ./content
COPY --from=web /src/dist ./dist
RUN useradd --system --uid 10001 --home /app tutor && mkdir -p /app/backend/data/voice && chown -R tutor /app/backend/data
USER tutor
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/ready', timeout=4).status == 200 else 1)"
WORKDIR /app/backend
# Listens on $PORT when the platform sets one (Railway, Render, Heroku-style hosts), else 8000.
# No uvicorn access log: its request lines would include query strings (the app logs requests itself).
CMD ["sh", "-c", "exec python -m uvicorn ai_tutor.asgi:app --host 0.0.0.0 --port \"${PORT:-8000}\" --proxy-headers --forwarded-allow-ips '*' --no-access-log"]
