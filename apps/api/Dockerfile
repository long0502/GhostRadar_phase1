FROM node:20-alpine
WORKDIR /app
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run generate
RUN npm run build
EXPOSE 8088
CMD ["sh", "-c", "npx prisma db push --schema=./prisma/schema.prisma --url=\"$DATABASE_URL\" && npm run start:prod"]
