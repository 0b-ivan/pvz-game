# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG BUILD_SHA=docker
ENV CF_PAGES_COMMIT_SHA=${BUILD_SHA}

RUN npm run build \
	&& mkdir -p /out \
	&& cp -a index.html app.webmanifest game img robots.txt /out/ \
	&& if [ -f service-worker.js ]; then cp service-worker.js /out/; fi

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/ /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
