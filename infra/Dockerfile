# Node strips the types, so the server runs from source with no build step.
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:9b945e92c1b5463a4b75f11e8417515e4bea7355f6adfd79ec220fbbe905dda8

WORKDIR /app

COPY package.json ./
COPY node_modules ./node_modules
COPY src ./src
COPY data/dist ./data/dist

CMD ["src/web/server.ts"]
