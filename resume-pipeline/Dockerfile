FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app

# Create a non-root user for security
RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
USER nodeapp
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1
CMD ["node", "--max-old-space-size=512", "dist/index.js"]
