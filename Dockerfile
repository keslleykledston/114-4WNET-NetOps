# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS workspace-deps

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
RUN pnpm config set store-dir /pnpm/store \
  && pnpm config set fetch-retries 5 \
  && pnpm config set fetch-retry-mintimeout 10000 \
  && pnpm config set fetch-retry-maxtimeout 120000 \
  && pnpm config set network-timeout 300000

WORKDIR /app/workspace

# Copy only manifests first. Keeps dependency install cached when source changes.
COPY --link workspace/package.json workspace/pnpm-lock.yaml workspace/pnpm-workspace.yaml ./
COPY --link workspace/scripts/package.json ./scripts/package.json
COPY --link workspace/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --link workspace/artifacts/netops-manager/package.json ./artifacts/netops-manager/package.json
COPY --link workspace/artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/package.json
COPY --link workspace/lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY --link workspace/lib/api-spec/package.json ./lib/api-spec/package.json
COPY --link workspace/lib/api-zod/package.json ./lib/api-zod/package.json
COPY --link workspace/lib/db/package.json ./lib/db/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts --offline

FROM workspace-deps AS workspace-src

COPY --link workspace/ ./

FROM workspace-src AS api-runtime

ENV NODE_ENV=production
ENV PORT=8080

RUN pnpm --filter @workspace/api-server run build

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]

FROM workspace-src AS frontend-build

ARG FRONTEND_PORT=24780
ARG BASE_PATH=/

ENV NODE_ENV=production
ENV PORT=${FRONTEND_PORT}
ENV BASE_PATH=${BASE_PATH}

RUN rm -rf /app/workspace/artifacts/netops-manager/.vite /app/workspace/artifacts/netops-manager/dist

RUN pnpm --filter @workspace/netops-manager run build

FROM nginx:1.27-alpine AS frontend-runtime

COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/workspace/artifacts/netops-manager/dist/public/ /usr/share/nginx/html/
