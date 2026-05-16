# syntax=docker/dockerfile:1.7

# --- Stage 1: build the SPA ---------------------------------------------------
#
# Base images are pinned by *digest*, not just tag — same rule as GitHub Action
# pinning (.claude/rules/supply-chain.md §4). Bump the tag in the comment and
# the digest in the same commit.
#
# node:24.15.0-bookworm-slim  (matches .nvmrc; pinned by manifest digest)
FROM node@sha256:24dc26ef1e3c3690f27ebc4136c9c186c3133b25563ae4d7f0692e4d1fe5db0e AS build

# Pinned pnpm — corepack picks up the version from package.json#packageManager.
ENV CI=1 \
    PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH

WORKDIR /app

# Install only what changes infrequently first, for layer-cache hits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack enable && corepack prepare --activate \
 && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY biome-plugins ./biome-plugins
COPY src ./src
COPY server ./server
COPY vite.config.ts ./

RUN pnpm run build

# --- Stage 2: runtime ---------------------------------------------------------
#
# oven/bun:1.3.14-debian (matches .tool-versions; pinned by manifest digest)
FROM oven/bun@sha256:9dba1a1b43ce28c9d7931bfc4eb00feb63b0114720a0277a8f939ae4dfc9db6f AS runtime

# Non-root user. The image carries code; secrets are runtime-only
# (.claude/rules/public-repo.md §2) — never ARG/ENV them here.
RUN useradd --system --create-home --uid 10001 --gid users xray
USER xray
WORKDIR /home/xray/app

# Copy only what the runtime needs: the built SPA + the server source.
# Bun runs TS directly, so server/ ships as .ts.
COPY --chown=xray:users --from=build /app/dist ./dist
COPY --chown=xray:users --from=build /app/server ./server
COPY --chown=xray:users --from=build /app/src/adapters ./src/adapters
COPY --chown=xray:users --from=build /app/tsconfig.json ./
COPY --chown=xray:users --from=build /app/package.json ./

ENV HOST=0.0.0.0 \
    PORT=8080 \
    NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --eval "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "server/index.ts"]
