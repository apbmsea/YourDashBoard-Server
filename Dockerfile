FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000
# Apply pending migrations, then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
