# Use Node.js 20 LTS Alpine image for a lightweight and secure build
FROM node:20-alpine

# Set environment to production
ENV NODE_ENV=production

# Set working directory inside container
WORKDIR /app

# Copy package files to install dependencies first
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy application source code
COPY src/ ./src/

# Expose port (evaluated port is 8080)
EXPOSE 8080

# Start the application
CMD ["node", "src/app.js"]
