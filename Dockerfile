
# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# Copy manifests first so the dependency layer caches across source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY shared ./shared
COPY server ./server
COPY scripts ./scripts
COPY src ./src

RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

# Stamped into /api/health as buildVersion, so a redeploy that silently didn't
# pick up new code is a one-request check instead of a guess. Pass with
# `--build-arg GIT_SHA=$(git rev-parse --short HEAD)`; a platform that builds
# straight from a git push usually sets its own equivalent env var instead
# (see server/env.ts), and this is simply left as 'unknown' otherwise.
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    GIT_SHA=${GIT_SHA}

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# The station list and config file live on a volume so they survive redeploys.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
