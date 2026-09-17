FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN python3 -m venv /opt/audio \
    && /opt/audio/bin/pip install --no-cache-dir --disable-pip-version-check -r requirements.txt
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/dist/shared ./dist/shared
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    PYTHON_BIN=/opt/audio/bin/python
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
