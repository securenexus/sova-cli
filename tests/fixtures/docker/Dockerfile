FROM node:18-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git curl

COPY package*.json ./
RUN npm install --production

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
