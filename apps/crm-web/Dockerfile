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
RUN mkdir -p /app/_optional/driver /app/_optional/manager /app/_optional/apk /app/_optional/root \
  && if [ -d apps/driver-app/build/web ]; then cp -a apps/driver-app/build/web/. /app/_optional/driver/; fi \
  && if [ -d apps/manager-app/build/web ]; then cp -a apps/manager-app/build/web/. /app/_optional/manager/; fi \
  && if [ -d apk ]; then cp -a apk/. /app/_optional/apk/; fi \
  && if [ -f gopark-manager.apk ]; then cp gopark-manager.apk /app/_optional/root/gopark-manager.apk; fi \
  && if [ -f gopark-driver.apk ]; then cp gopark-driver.apk /app/_optional/root/gopark-driver.apk; fi \
  && for file in manager-download.html gopark-manager.zip; do if [ -f "$file" ]; then cp "$file" /app/_optional/root/; fi; done

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/crm-web/dist /usr/share/nginx/html
COPY --from=build /app/_optional/driver /usr/share/nginx/html/driver
COPY --from=build /app/_optional/manager /usr/share/nginx/html/manager
COPY --from=build /app/_optional/root /usr/share/nginx/html
COPY --from=build /app/_optional/apk /usr/share/nginx/html/apk
COPY apps/crm-web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
