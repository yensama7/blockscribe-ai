FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached)
COPY package*.json ./
RUN npm install

# Copy rest of code
COPY . .

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8081"]