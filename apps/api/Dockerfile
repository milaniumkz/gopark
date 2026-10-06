FROM node:22-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY packages/contracts/package.json packages/contracts/package.json

RUN corepack enable

FROM base AS deps
RUN pnpm install --filter @gopark/api... --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @gopark/api db:generate
RUN pnpm --filter @gopark/api build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/scripts ./apps/api/scripts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
# Runtime imports must resolve compiled JavaScript, including .js re-exports.
COPY --from=build /app/apps/api/dist/packages/contracts/src ./packages/contracts/src
RUN node -e 'const fs=require("fs");const file="packages/contracts/package.json";const p=JSON.parse(fs.readFileSync(file,"utf8"));p.main="./src/index.js";fs.writeFileSync(file,JSON.stringify(p))'
RUN node --input-type=module -e 'await import("./apps/api/node_modules/@gopark/contracts/src/index.js"); await import("./apps/api/dist/apps/api/src/app.module.js")'


EXPOSE 8080
CMD ["node", "apps/api/dist/apps/api/src/runtime-entry.js"]
