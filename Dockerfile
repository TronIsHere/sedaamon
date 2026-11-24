# Sedaamon web app (Next.js + Socket.io in one process). MongoDB and LiveKit run as separate containers:
# see docker-compose.yml and docs/en/installation.md.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Dev dependencies stay: the server runs TypeScript through tsx and Next reads next.config.ts.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

# These are baked into the pages at build time (canonical links, sitemap, share images), so changing
# one means rebuilding the image: docker compose up -d --build
ARG SITE_URL=http://localhost:3000
ARG SITE_CONTACT_EMAIL=
ARG ENAMAD_ID=
ARG ENAMAD_CODE=
ENV SITE_URL=$SITE_URL \
    SITE_CONTACT_EMAIL=$SITE_CONTACT_EMAIL \
    ENAMAD_ID=$ENAMAD_ID \
    ENAMAD_CODE=$ENAMAD_CODE
RUN npm run build

# Local-disk uploads go here; mount a volume on it (compose does).
RUN mkdir -p /data/uploads && chown -R node:node /data /app/.next
ENV UPLOAD_DIR=/data/uploads
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server.ts"]
