#!/usr/bin/env node

/**
 * TinyTask MCP Server
 *
 * A minimal task management system for LLM agents exposed as an MCP server.
 */

import { initializeDatabase } from './db/init.js';
import { TaskService, CommentService, LinkService } from './services/index.js';
import { createMcpServer } from './server/mcp-server.js';
import { startStdioServer } from './server/stdio.js';
import { startHttpServer } from './server/http.js';
import { logger } from './utils/index.js';

/**
 * Main entry point for TinyTask MCP Server
 */
async function main() {
  try {
    // Load configuration from environment variables
    let mode = process.env.TINYTASK_MODE || 'both';
    const dbPath = process.env.TINYTASK_DB_PATH || './data/tinytask.db';
    const port = parseInt(process.env.TINYTASK_PORT || '3000', 10);
    const host = process.env.TINYTASK_HOST || '0.0.0.0';
    const logLevelEnv = process.env.TINYTASK_LOG_LEVEL || 'info';

    // Mode normalization - handle legacy 'sse' mode
    if (mode === 'sse') {
      logger.warn('⚠️  TINYTASK_MODE=sse is deprecated. Use TINYTASK_MODE=http with TINYTASK_ENABLE_SSE=true');
      mode = 'http';
      if (!process.env.TINYTASK_ENABLE_SSE) {
        process.env.TINYTASK_ENABLE_SSE = 'true';
      }
    }

    // Validate mode
    if (!['stdio', 'http', 'both'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Must be stdio, http, or both`);
    }

    // Validate port for HTTP mode
    if ((mode === 'http' || mode === 'both') && (isNaN(port) || port < 1 || port > 65535)) {
      throw new Error(`Invalid port: ${port}. Must be between 1 and 65535`);
    }

    // Determine actual transport for display
    const enableSse = process.env.TINYTASK_ENABLE_SSE === 'true';
    const httpTransport = enableSse ? 'SSE (legacy)' : 'Streamable HTTP';

    // Print startup banner
    logger.info('='.repeat(50));
    logger.info('TinyTask MCP Server');
    logger.info('='.repeat(50));
    logger.info(`Mode: ${mode}`);
    if (mode === 'http' || mode === 'both') {
      logger.info(`HTTP Transport: ${httpTransport}`);
    }
    logger.info(`Database: ${dbPath}`);
    logger.info(`Log Level (env): ${logLevelEnv}`);
    logger.info(`Log Level (actual): ${logger.getLevelName()}`);
    if (mode === 'http' || mode === 'both') {
      logger.info(`Host: ${host}`);
      logger.info(`Port: ${port}`);
    }
    logger.info('='.repeat(50));

    // Test trace logging
    logger.trace('Trace logging is active - this message should only appear at TRACE level');
    logger.debug('Debug logging is active - this message should appear at DEBUG and TRACE levels');

    // Initialize database
    console.error('Initializing database...');
    const db = initializeDatabase(dbPath);
    console.error('✓ Database initialized');

    // Create services
    console.error('Creating services...');
    const taskService = new TaskService(db);
    const commentService = new CommentService(db);
    const linkService = new LinkService(db);
    console.error('✓ Services created');

    // Create MCP server
    console.error('Creating MCP server...');
    const server = createMcpServer(taskService, commentService, linkService);
    console.error('✓ MCP server created');

    // Start appropriate transport(s)
    if (mode === 'stdio' || mode === 'both') {
      console.error('Starting stdio transport...');
      // Note: startStdioServer is a blocking call in stdio-only mode
      // In 'both' mode, we start it without awaiting to allow SSE to start too
      if (mode === 'both') {
        // Start stdio in background, don't await
        startStdioServer(server).catch((error) => {
          console.error('Stdio transport error:', error);
        });
        console.error('✓ Stdio transport started');
      } else {
        // Stdio-only mode, await it (it will block)
        await startStdioServer(server);
      }
    }

    if (mode === 'http' || mode === 'both') {
      console.error('Starting HTTP transport...');
      await startHttpServer(taskService, commentService, linkService, { port, host });
      console.error('✓ HTTP transport started');
    }

    console.error('='.repeat(50));
    console.error('Server ready!');
    console.error('='.repeat(50));
  } catch (error) {
    console.error('='.repeat(50));
    console.error('Failed to start server:', error);
    console.error('='.repeat(50));
    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
function setupShutdownHandlers() {
  const shutdown = (signal: string) => {
    console.error(`\nReceived ${signal}, shutting down gracefully...`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Setup shutdown handlers
setupShutdownHandlers();

// Start the server
main();
