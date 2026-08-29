FROM node:20.19-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY tailwind.config.cjs postcss.config.cjs components.json ./
COPY public ./public
COPY src ./src

RUN npm run build

FROM node:20.19-alpine

RUN npm install -g serve@14.2.4 && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs

WORKDIR /app

COPY --from=builder --chown=nodeuser:nodejs /app/dist ./dist
COPY --chown=nodeuser:nodejs healthcheck.js ./healthcheck.js

USER nodeuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node healthcheck.js || exit 1

EXPOSE 3003

CMD ["serve", "-s", "dist", "-l", "3003", "--cors"]
