# Build stage
FROM --platform=linux/amd64 node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (use npm install since this is a workspace package without its own lockfile)
RUN npm install

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM --platform=linux/amd64 node:22-alpine AS production

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built files from builder
COPY --from=builder /app/build ./build

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose the proxy port
EXPOSE 6277

# Set environment variables
ENV HOST=0.0.0.0
ENV SERVER_PORT=6277
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:6277/health || exit 1

# Start the server
CMD ["node", "build/index.js"]
