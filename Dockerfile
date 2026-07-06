# ---- build the admin frontend ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts ./scripts
RUN npm install
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY scripts ./scripts
RUN npm install --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
ENV PORT=5340
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 5340
CMD ["node", "server/index.js"]
