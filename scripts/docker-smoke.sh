#!/usr/bin/env bash
# Build the production image, run it, hit /healthz, kill it.
# Same check that CI runs before publishing — if this passes locally, it passes in CI.
# See .claude/rules/supply-chain.md (local-first principle in CLAUDE.md).

set -euo pipefail

IMAGE="${IMAGE:-xray:smoke}"
CONTAINER="${CONTAINER:-xray-smoke}"
PORT="${PORT:-8080}"
TIMEOUT="${TIMEOUT:-30}"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "→ building $IMAGE"
docker build -t "$IMAGE" .

echo "→ running $CONTAINER on :$PORT"
docker run -d --rm --name "$CONTAINER" -p "$PORT:8080" "$IMAGE" >/dev/null

# Reuses the Dockerfile's HEALTHCHECK — one definition of "healthy".
echo "→ waiting for container health=healthy (timeout ${TIMEOUT}s)"
for i in $(seq 1 "$TIMEOUT"); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
  if [ "$status" = "healthy" ]; then
    echo "✓ healthy after ${i}s"
    exit 0
  fi
  if [ "$status" = "unhealthy" ]; then
    break
  fi
  sleep 1
done

echo "✗ container did not reach healthy within ${TIMEOUT}s (last status: $status) — dumping logs:"
docker logs "$CONTAINER" || true
exit 1
