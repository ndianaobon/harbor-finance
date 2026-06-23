FROM node:18-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY backend/ ./backend/

COPY index.html auth.html dashboard.html admin.html ./public/
COPY assets/ ./public/assets/

EXPOSE 4000
CMD ["node", "backend/src/index.js"]
