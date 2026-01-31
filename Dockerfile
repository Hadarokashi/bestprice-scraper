# Use Playwright's official image which includes browsers
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy server code
COPY server.js ./

# Expose port
EXPOSE 3001

# Start server
CMD ["npm", "start"]
