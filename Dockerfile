FROM node:24-bookworm-slim
WORKDIR /app
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web --ignore-scripts --no-fund
COPY . .
RUN npm run build --prefix web && mkdir -p /data && node src/seed.mjs /data/seed-event.sqlite
ENV PS1_BIND=0.0.0.0
ENV PS1_PORT=8788
ENV PS1_SQLITE_PATH=/data/seed-event.sqlite
EXPOSE 8788
CMD ["sh", "-c", "PS1_AUTH_SECRET=${PS1_AUTH_SECRET:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \\n')} node src/server.mjs"]
