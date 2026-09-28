FROM node:24.14.0-alpine
LABEL authors="tatiana"

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY ./src ./src

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
