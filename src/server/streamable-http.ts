/**
 * Streamable HTTP transport for MCP server
 * Enables remote multi-agent access over HTTP with unified endpoint
 */

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../utils/index.js';
import { createMcpServer } from './mcp-server.js';

/**
 * Configuration options for Streamable HTTP server
 */
export interface StreamableHttpServerOptions {
  port?: number;
  host?: string;
}

/**
 * Start the MCP server with Streamable HTTP transport
 */
export async function startStreamableHttpServer(
  taskService: import('../services/task-service.js').TaskService,
  commentService: import('../services/comment-service.js').CommentService,
  linkService: import('../services/link-service.js').LinkService,
  options?: StreamableHttpServerOptions
): Promise<void> {
  const app = express();
  const port = options?.port ?? parseInt(process.env.TINYTASK_PORT || '3000');
  const host = options?.host ?? process.env.TINYTASK_HOST ?? '0.0.0.0';

  // Store active transports by session ID - each session gets its own MCP Server instance
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

  // Middleware
  app.use(express.json());

  // CORS support
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      transport: 'streamable-http',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime(),
      sessionCount: sessions.size,
    });
  });

  // Unified MCP endpoint for Streamable HTTP - handles both POST and GET
  app.use('/mcp', async (req, res) => {
    const startTime = Date.now();

    logger.info('🌐 STREAMABLE HTTP REQUEST', {
      method: req.method,
      currentSessionCount: sessions.size,
      clientIp: req.ip,
      timestamp: new Date().toISOString(),
    });

    // For new requests, create transport and session
    // The transport itself manages session IDs
    const transport = new StreamableHTTPServerTransport();
    const sessionServer = createMcpServer(taskService, commentService, linkService);

    const sessionId = transport.sessionId || 'unknown';
    
    logger.info('✨ CREATING NEW SESSION', {
      sessionId,
      timestamp: new Date().toISOString(),
    });

    sessions.set(sessionId, { transport, server: sessionServer });

    logger.info('🔗 CONNECTING SESSION SERVER TO TRANSPORT', {
      sessionId,
      timestamp: new Date().toISOString(),
    });

    await sessionServer.connect(transport);

    logger.info('✅ SESSION ESTABLISHED', {
      sessionId,
      totalActiveSessions: sessions.size,
      timestamp: new Date().toISOString(),
    });

    try {
      logger.info('🔄 HANDLING REQUEST VIA TRANSPORT', {
        sessionId,
        method: req.method,
        timestamp: new Date().toISOString(),
      });

      // Let the transport handle the request/response
      // Pass the pre-parsed body from Express middleware to avoid double-parsing
      await transport.handleRequest(req, res, req.body);

      const duration = Date.now() - startTime;

      logger.info('✅ REQUEST COMPLETED', {
        sessionId,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('❌ REQUEST FAILED', {
        sessionId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process request' });
      }
    }
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use(
    (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Server error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  );

  // Start server
  const httpServer = app.listen(port, host, () => {
    logger.info('TinyTask MCP server running on Streamable HTTP');
    logger.info(`URL: http://${host}:${port}/mcp`);
    logger.info(`Health: http://${host}:${port}/health`);
    logger.info(`Database: ${process.env.TINYTASK_DB_PATH || './data/tinytask.db'}`);
    logger.info('Mode: Streamable HTTP');
    logger.info('Press Ctrl+C to stop');
  });

  // Configure HTTP timeouts
  httpServer.timeout = 120000; // 2 minute timeout for requests
  httpServer.keepAliveTimeout = 65000; // 65 seconds
  httpServer.headersTimeout = 66000; // Slightly longer than keepAliveTimeout

  logger.info('HTTP timeouts configured for Streamable HTTP transport');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down Streamable HTTP server...');
    httpServer.close(async () => {
      logger.info('Server closed');

      // Close all session servers
      for (const [sessionId, session] of sessions.entries()) {
        logger.info(`Closing session: ${sessionId}`);
        await session.server.close().catch((err) => {
          logger.error(`Error closing session ${sessionId}`, { error: err });
        });
      }
      sessions.clear();

      process.exit(0);
    });

    // Force close after 5 seconds
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
