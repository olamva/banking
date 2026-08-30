# Node strips the types, so the server runs from source with no build step.
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3

WORKDIR /app

COPY package.json ./
COPY node_modules ./node_modules
COPY src ./src
COPY data/dist ./data/dist

USER node

ENV PORT=80
EXPOSE 80

CMD ["node", "src/web/server.ts"]
