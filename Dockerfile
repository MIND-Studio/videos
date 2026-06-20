# syntax=docker/dockerfile:1
# Production images for mind-video — two targets off one deps stage:
#   web    — the Next.js studio (standalone server, :3170). Plans reels, previews
#            them in-browser, and proxies render requests to the worker. The
#            browser talks directly to the pod; this image holds no pod creds.
#   worker — the stateless MP4 render service (:3172). Runs `npx hyperframes
#            render` (headless Chromium + ffmpeg) per request in isolated temp
#            dirs; holds no pod creds, persists nothing. The web app reaches it
#            via the /api/render proxy (internal only).
#
# Build (NODE_AUTH_TOKEN is required — @mind-studio/* comes from GitHub Packages,
# see .npmrc):
#   docker build --target web    --build-arg NODE_AUTH_TOKEN -t mind-video-web .
#   docker build --target worker --build-arg NODE_AUTH_TOKEN -t mind-video-worker .

FROM node:22-alpine AS deps
WORKDIR /app
ARG NODE_AUTH_TOKEN
ENV NODE_AUTH_TOKEN=$NODE_AUTH_TOKEN
COPY package.json package-lock.json* .npmrc ./
RUN npm ci && rm -f .npmrc

FROM deps AS build
WORKDIR /app
# NEXT_PUBLIC_* values are inlined into the client bundle AT BUILD TIME —
# override these args when the deployment doesn't run on localhost.
ARG NEXT_PUBLIC_POD_BASE_URL=https://pods.mindpods.org/
ARG NEXT_PUBLIC_SOLID_ISSUER
ENV NEXT_PUBLIC_POD_BASE_URL=$NEXT_PUBLIC_POD_BASE_URL \
    NEXT_PUBLIC_SOLID_ISSUER=$NEXT_PUBLIC_SOLID_ISSUER \
    NEXT_TELEMETRY_DISABLED=1
COPY tsconfig.json next.config.ts postcss.config.mjs ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- web: the Next standalone server ---------------------------------------
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3170
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3170
CMD ["node", "server.js"]

# ---- worker: stateless hyperframes render service --------------------------
# Runs `npx hyperframes render` per request in isolated temp dirs. Needs
# headless Chromium + ffmpeg. Stateless and credential-free — never touches the
# pod; the browser uploads the MP4 it returns.
FROM deps AS worker
WORKDIR /app
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont ffmpeg \
    && { [ -e /usr/bin/chromium-browser ] || ln -s /usr/bin/chromium /usr/bin/chromium-browser; }
ENV NODE_ENV=production \
    WORKER_PORT=3172 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROMIUM_PATH=/usr/bin/chromium-browser
COPY hyperframes ./hyperframes
COPY worker ./worker
COPY src ./src
RUN mkdir -p /app/.work
EXPOSE 3172
CMD ["node", "worker/server.mjs"]
