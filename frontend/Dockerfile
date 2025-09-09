FROM node:20-slim

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm install

# Copy app files
COPY . .

# Expose Vite’s default port
EXPOSE 80

# Run in dev mode
CMD ["npm", "run", "dev", "--", "--host"]
