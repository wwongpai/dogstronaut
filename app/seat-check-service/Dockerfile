FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm install --omit=dev --silent

# Copy source
COPY src/ ./src/

# Non-root user for security
RUN addgroup -S cosmocab && adduser -S cosmocab -G cosmocab
RUN chown -R cosmocab:cosmocab /app
USER cosmocab

EXPOSE 4005

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4005/health || exit 1

CMD ["node", "src/index.js"]
