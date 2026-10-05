FROM node:22-alpine AS base
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/crm-web/package.json apps/crm-web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN corepack enable

FROM base AS deps
RUN pnpm install --filter @gopark/crm-web... --no-frozen-lockfile

FROM deps AS build
ARG VITE_API_BASE_URL=/api
ARG VITE_FIREBASE_WEB_VAPID_KEY=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_FIREBASE_WEB_VAPID_KEY=${VITE_FIREBASE_WEB_VAPID_KEY}
COPY . .
RUN pnpm --filter @gopark/crm-web build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/crm-web/dist /usr/share/nginx/html
COPY apps/driver-app/build/web /usr/share/nginx/html/driver
COPY apps/manager-app/build/web /usr/share/nginx/html/manager
COPY gopark-manager.apk /usr/share/nginx/html/gopark-manager.apk
COPY gopark-driver.apk /usr/share/nginx/html/gopark-driver.apk
COPY apk /usr/share/nginx/html/apk
COPY apps/crm-web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
