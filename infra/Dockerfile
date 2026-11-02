# Node strips the types, so the server runs from source with no build step.
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:044d090d0c3ccfd30722126ebe46704885698970c8a303419dc0d704d628f0da

WORKDIR /app

COPY package.json ./
COPY node_modules ./node_modules
COPY src ./src
COPY data/dist ./data/dist

CMD ["src/web/server.ts"]
