FROM node:18-alpine
WORKDIR /app

# Install dependencies from root package.json
COPY package.json ./
RUN npm install --omit=dev

# Copy the backend source
COPY backend/ ./backend/

EXPOSE 4000
CMD ["node", "backend/src/index.js"]
