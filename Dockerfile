FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY . .

# Create required directories
RUN mkdir -p uploads logs

# Expose port
EXPOSE 3000

# Start
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node src/server.js"]
