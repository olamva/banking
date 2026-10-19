# Node strips the types, so the server runs from source with no build step.
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:afc6657a4b662f9cb69ca892b0596e55d6ef81a10e83ee8887b13f602877df89

WORKDIR /app

COPY package.json ./
COPY node_modules ./node_modules
COPY src ./src
COPY data/dist ./data/dist

CMD ["src/web/server.ts"]
