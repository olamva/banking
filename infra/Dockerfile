# Node strips the types, so the server runs from source with no build step.
FROM node:26-alpine

WORKDIR /app

COPY package.json ./
COPY node_modules ./node_modules
COPY src ./src
COPY data/dist ./data/dist

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/web/server.ts"]
