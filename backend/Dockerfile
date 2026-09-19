FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat

FROM base AS development
COPY package*.json ./
RUN npm install
ENV NODE_ENV=development
EXPOSE 4000
CMD ["npm", "run", "dev"]

FROM base AS production
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
EXPOSE 4000
CMD ["node", "src/server.js"]
