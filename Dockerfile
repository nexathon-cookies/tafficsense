# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS dependencies

ENV COREPACK_HOME=/opt/corepack \
    npm_config_store_dir=/home/node/.local/share/pnpm/store \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
RUN corepack enable \
    && mkdir -p /opt/corepack /app/apps/web/.next \
    && chown -R node:node /opt/corepack /app

USER node
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/mobile/package.json apps/mobile/package.json
COPY --chown=node:node packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=trafficsense-pnpm,target=/home/node/.local/share/pnpm/store,uid=1000,gid=1000 \
    corepack install && pnpm install --frozen-lockfile --fetch-timeout 600000

FROM dependencies AS development
COPY --chown=node:node . .
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

FROM development AS builder
RUN pnpm build

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/web/public ./public
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM development AS supabase-tools
COPY --from=docker:28.5.2-cli /usr/local/bin/docker /usr/local/bin/docker
