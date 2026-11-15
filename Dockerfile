FROM node:24-bookworm-slim AS builder
WORKDIR /build
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY web ./web
RUN npm run build --prefix web \
  && mkdir -p /build-seed \
  && node src/seed.mjs /build-seed/seed-event.sqlite

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
COPY --from=builder /build/src ./src
COPY --from=builder /build/web/dist ./web/dist
COPY --from=builder /build-seed/seed-event.sqlite /build-seed/seed-event.sqlite
RUN chmod -R a-w /app /build-seed \
  && mkdir -p /data \
  && chown -R node:node /data \
  && chmod 0700 /data

USER node
ENV NODE_ENV=production \
    PS1_BIND=0.0.0.0 \
    PS1_PORT=8788 \
    PS1_SQLITE_PATH=/data/seed-event.sqlite \
    PS1_DEMO_AUTH=1 \
    PS1_TRUST_PROXY=1

EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["sh", "-c", "node -e \"fetch('http://127.0.0.1:'+(process.env.PORT||process.env.PS1_PORT||8788)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]

CMD ["sh", "-c", "DB_TARGET=\"${PS1_SQLITE_PATH:-/data/seed-event.sqlite}\"; DB_DIR=$(dirname \"$DB_TARGET\"); if [ ! -w \"$DB_DIR\" ]; then DB_TARGET=/tmp/seed-event.sqlite; DB_DIR=/tmp; fi; if [ ! -f \"$DB_TARGET\" ]; then cp /build-seed/seed-event.sqlite \"$DB_TARGET\" && chmod 0600 \"$DB_TARGET\"; fi; SECRET_VAL=\"${PS1_AUTH_SECRET:-}\"; if [ -z \"$SECRET_VAL\" ]; then SECRET_FILE=\"$DB_DIR/.ps1_boot_secret\"; if [ ! -s \"$SECRET_FILE\" ]; then node -e \"process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))\" > \"$SECRET_FILE\" && chmod 0600 \"$SECRET_FILE\"; fi; SECRET_VAL=$(cat \"$SECRET_FILE\"); fi; PS1_PORT=\"${PORT:-${PS1_PORT:-8788}}\" PS1_SQLITE_PATH=\"$DB_TARGET\" PS1_AUTH_SECRET=\"$SECRET_VAL\" exec node src/server.mjs"]
