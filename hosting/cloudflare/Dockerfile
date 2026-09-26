# The demo exactly as it runs locally, in public mode. Build context: the repo root.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV DEMO_PUBLIC=1 HOST=0.0.0.0 PORT=4300
EXPOSE 4300
CMD ["node", "api/dist/main.js"]
