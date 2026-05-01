### Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_DD_RUM_APPLICATION_ID
ARG VITE_DD_RUM_CLIENT_TOKEN
ARG VITE_DD_ENV=production

COPY package*.json ./
RUN npm ci --silent

COPY . .
RUN npm run build

### Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config with /api proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
