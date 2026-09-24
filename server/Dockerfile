FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first so they're cached across source changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
# Scraped catalog shipped as seed data; a named volume mounted on /app/data
# is populated from it on first run and keeps later scrapes + image cache
COPY --chown=node:node data ./data

USER node

ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/index.js"]
