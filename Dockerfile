# Multi-stage Dockerfile for TinyTask MCP Server
# Supports multiple transport modes:
# - stdio: For local MCP client connections
# - http: For Streamable HTTP transport (default for remote connections)
# - both: Both stdio and http (default if TINYTASK_MODE not set)
#
# HTTP Transport Configuration:
# - By default uses Streamable HTTP (efficient, modern protocol)
# - Set TINYTASK_ENABLE_SSE=true for legacy SSE transport
# - Use docker-compose.legacy-sse.yml for SSE-specific deployment

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and source code first
COPY package*.json tsconfig.json ./
COPY src ./src

# Install dependencies (this will trigger prepare script which builds)
RUN npm ci

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create data directory
RUN mkdir -p /data && chown node:node /data

# Copy package files
COPY package*.json ./

# Install production dependencies with build tools for native modules
RUN apk add --no-cache python3 make g++ && \
    npm ci --omit=dev --ignore-scripts && \
    npm rebuild better-sqlite3 && \
    apk del python3 make g++

# Copy built application
COPY --from=builder /app/build ./build

# Use non-root user
USER node

# Expose HTTP port (works with both Streamable HTTP and legacy SSE)
EXPOSE 3000

# Health check (works with both transport types when in http/both mode)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start server
# Default behavior without environment variables: runs in 'both' mode with Streamable HTTP
CMD ["node", "build/index.js"]
