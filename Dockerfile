FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY drizzle.config.js ./

RUN chmod +x src/start_bot.sh

ENV NODE_ENV=production

CMD ["src/start_bot.sh"]
