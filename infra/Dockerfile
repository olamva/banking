# Node strips the types, so the server runs from source with no build step.
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:1d736cf8b5716c07a245301f92717143215d248fd55771ee1936ef4b3302e531

WORKDIR /app

COPY package.json ./
COPY node_modules ./node_modules
COPY src ./src
COPY data/dist ./data/dist

CMD ["src/web/server.ts"]
