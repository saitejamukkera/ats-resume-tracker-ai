FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev
# Copy static JSON assets that tsc doesn't include in dist/
RUN mkdir -p /app/dist/validation/taxonomy && cp /app/src/validation/taxonomy/skills-taxonomy.json /app/dist/validation/taxonomy/

FROM node:22-slim
WORKDIR /app

RUN groupadd -r nodeapp && useradd -r -g nodeapp nodeapp

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
RUN mkdir -p /app/.cache/huggingface && chown nodeapp:nodeapp /app/.cache/huggingface
RUN mkdir -p /app/data && chown nodeapp:nodeapp /app/data
USER nodeapp
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["node", "--max-old-space-size=768", "dist/index.js"]
