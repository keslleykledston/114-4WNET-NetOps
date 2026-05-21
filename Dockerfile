FROM node:24-bookworm-slim AS workspace-base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /app/workspace

COPY workspace/ ./

RUN pnpm install --no-frozen-lockfile --ignore-scripts

FROM workspace-base AS api-runtime

ENV NODE_ENV=production
ENV PORT=8080

RUN pnpm --filter @workspace/api-server run build

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]

FROM workspace-base AS frontend-build

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
