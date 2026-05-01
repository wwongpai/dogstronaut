FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --silent

COPY src/ ./src/

RUN addgroup -S cosmocab && adduser -S cosmocab -G cosmocab
RUN chown -R cosmocab:cosmocab /app
USER cosmocab

EXPOSE 4002

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4002/health || exit 1

CMD ["node", "src/index.js"]
