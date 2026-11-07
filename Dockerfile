# OmniTrading Dockerfile
# Lightweight, non-root container for running OmniTrading locally or in self-hosted environments.

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
# Copy scripts and source for building
COPY scripts ./scripts
COPY src ./src

# Install dependencies and build frontend bundle
RUN npm install --ignore-scripts && \
    node scripts/patch-vela.cjs && \
    npx esbuild src/main.ts --bundle --format=iife --target=es2022 --outfile=dist/app.js

# Production runner image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

# Copy files
COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY indicators ./indicators
RUN mkdir -p custom-indicators
COPY index.html connected.html omni-icon.svg ./
COPY LICENSE NOTICE THIRD_PARTY_NOTICES ./

# Run as non-root user
USER node

EXPOSE 8787

CMD ["node", "server/omni-server.mjs"]
