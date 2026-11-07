# Lighthouse dev environment
# Covers: React 18.3.1 / Redux 5.0.1 (web), React Native 0.76 JS/Metro (mobile),
#         Java 25 (Spring Boot / Gradle), Python 3.12 (FastAPI / Poetry), JS/TS
#         AI SDKs: Gemini (Google), Claude (Anthropic), OpenAI, Hugging Face Hub
#
# API keys are NEVER baked into the image. Put them in a git-ignored .env file:
#   GEMINI_API_KEY=...
#   ANTHROPIC_API_KEY=...
#   OPENAI_API_KEY=...
#   HF_TOKEN=...
#
# Build:  docker build -t lighthouse-dev .
# Run:    docker run -it --rm --env-file .env -v "$PWD":/workspace \
#           -v hf-cache:/home/ubuntu/.cache/huggingface \
#           -p 3000:3000 -p 5173:5173 -p 8081:8081 -p 8080:8080 -p 8000:8000 lighthouse-dev

# Java 25 on Ubuntu 24.04 (noble), which ships Python 3.12 natively
FROM eclipse-temurin:25-jdk-noble

ARG NODE_VERSION=20.18.1
ARG POETRY_VERSION=2.1.1

# AI SDK versions (Python)
ARG PY_GOOGLE_GENAI=2.33.0
ARG PY_ANTHROPIC=2.3.0
ARG PY_OPENAI=3.37.0
ARG PY_HF_HUB=2.3.0
# AI SDK versions (Node)
ARG JS_GOOGLE_GENAI=2.31.0
ARG JS_ANTHROPIC=1.3.0
ARG JS_OPENAI=7.43.0
ARG JS_HF_INFERENCE=4.13.32
ARG JS_HF_HUB=2.17.9

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    NODE_PATH=/opt/node/lib/node_modules \
    HF_HOME=/home/ubuntu/.cache/huggingface
ENV PATH="/opt/ai-sdks/bin:/opt/node/bin:/opt/poetry/bin:${PATH}"

# --- System packages + Python 3.12 ---
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.12 python3.12-venv python3-pip python3-dev \
        build-essential git curl xz-utils ca-certificates watchman \
    && ln -sf /usr/bin/python3.12 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

# --- Node.js (pinned, multi-arch) ---
RUN ARCH="$(dpkg --print-architecture)" \
    && case "$ARCH" in amd64) NODE_ARCH=x64 ;; arm64) NODE_ARCH=arm64 ;; *) echo "Unsupported arch: $ARCH" && exit 1 ;; esac \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
       | tar -xJ -C /opt \
    && mv "/opt/node-v${NODE_VERSION}-linux-${NODE_ARCH}" /opt/node \
    && corepack enable

# --- Poetry (isolated venv so it never clashes with project deps) ---
RUN python3.12 -m venv /opt/poetry \
    && /opt/poetry/bin/pip install --no-cache-dir "poetry==${POETRY_VERSION}"

# --- AI SDKs: Python (shared venv, first on PATH so `python` can import them) ---
RUN python3.12 -m venv /opt/ai-sdks \
    && /opt/ai-sdks/bin/pip install --no-cache-dir \
        "google-genai==${PY_GOOGLE_GENAI}" \
        "anthropic==${PY_ANTHROPIC}" \
        "openai==${PY_OPENAI}" \
        "huggingface_hub==${PY_HF_HUB}"

# --- AI SDKs: Node (global, resolvable via NODE_PATH for scripts/REPL) ---
RUN npm install -g --no-fund --no-audit \
        "@google/genai@${JS_GOOGLE_GENAI}" \
        "@anthropic-ai/sdk@${JS_ANTHROPIC}" \
        "openai@${JS_OPENAI}" \
        "@huggingface/inference@${JS_HF_INFERENCE}" \
        "@huggingface/hub@${JS_HF_HUB}" \
    && npm cache clean --force

# --- Non-root user (the base image already has uid 1000 "ubuntu") ---
RUN mkdir -p /workspace "${HF_HOME}" \
    && chown -R ubuntu:ubuntu /workspace /home/ubuntu/.cache
USER ubuntu
WORKDIR /workspace

# React (CRA/Vite) · Metro bundler · Spring Boot · FastAPI
EXPOSE 3000 5173 8081 8080 8000

CMD ["bash"]
