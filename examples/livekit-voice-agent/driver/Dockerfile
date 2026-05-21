# syntax=docker/dockerfile:1.7
#
# One-shot test-runner image. Builds from the REPO ROOT (../..) so it
# can COPY the in-tree xray Python SDK + the example's fixtures. Run
# via `docker compose --profile test run --rm driver`.

# python:3.12-slim-bookworm — pinned by digest per `.claude/rules/supply-chain.md` §4.
FROM python@sha256:93ab4b7fa528b25124c97bcc755415e60eb671a86b4dbe0328df2fe2d1c1193d

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /workspace

COPY sdk/python /workspace/sdk/python
RUN pip install --upgrade pip && \
    pip install -e "/workspace/sdk/python[livekit]" && \
    pip install "pytest>=8.0" "pytest-asyncio>=0.24" "httpx>=0.27"

COPY examples/livekit-voice-agent/driver /workspace/driver
COPY examples/livekit-voice-agent/fixtures /workspace/fixtures

WORKDIR /workspace/driver
CMD ["pytest", "-v", "-s", "test_e2e.py"]
