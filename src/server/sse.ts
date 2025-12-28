/**
 * SSE transport for MCP server
 * Enables remote multi-agent access over HTTP
 */

import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger, LogLevel } from '../utils/index.js';

/**
 * Configuration options for SSE server
 */
export interface SseServerOptions {
  port?: number;
  host?: string;
}

/**
 * Start the MCP server with SSE transport
 */
export async function startSseServer(server: Server, options?: SseServerOptions): Promise<void> {
  const app = express();
  const port = options?.port ?? parseInt(process.env.TINYTASK_PORT || '3000');
  const host = options?.host ?? process.env.TINYTASK_HOST ?? '0.0.0.0';

  // Store active transports by session ID
  const transports = new Map<string, SSEServerTransport>();

  // Middleware - but NOT for /mcp POST (it needs raw stream)
  app.use((req, res, next) => {
    if (req.path === '/mcp' && req.method === 'POST') {
      // Skip body parsing for MCP POST - the SDK needs raw stream
      next();
    } else {
      express.json()(req, res, next);
    }
  });

  // CORS support
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
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
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime(),
    });
  });

  // SSE endpoint for MCP protocol - GET establishes the SSE stream
  app.get('/mcp', async (req, res) => {
    logger.info(`New SSE connection from ${req.ip}`);

    const transport = new SSEServerTransport('/mcp', res);
    
    // Store transport by its session ID (before connecting)
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);
    logger.info(`SSE session established: ${sessionId}`);
    logger.debug('Transport details', { sessionId, clientIp: req.ip });
    
    // Connect server to transport (this calls transport.start() automatically)
    await server.connect(transport);

    // Handle disconnect
    req.on('close', () => {
      logger.info(`SSE connection closed: ${sessionId}`);
      transports.delete(sessionId);
    });
  });

  // SSE endpoint for MCP protocol - POST handles client messages
  app.post('/mcp', async (req, res) => {
    const startTime = Date.now();
    
    logger.info('MCP POST message received');
    
    // The session ID should be in the request (check query params, headers, or body)
    // MCP SDK typically uses query parameters
    const sessionId = (req.query.sessionId as string) || (req.headers['x-session-id'] as string);
    
    // Log request headers at TRACE level
    if (logger.shouldLog(LogLevel.TRACE)) {
      logger.trace('Request headers', {
        headers: req.headers,
        sessionId,
        query: req.query,
      });
    }
    
    if (!sessionId) {
      logger.warn('No session ID in POST request', {
        query: req.query,
        headers: req.headers,
      });
      res.status(400).json({ error: 'Missing session ID' });
      return;
    }
    
    const transport = transports.get(sessionId);
    
    if (!transport) {
      logger.error(`No transport found for session: ${sessionId}`, {
        availableSessions: Array.from(transports.keys()),
      });
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    // Capture request body for logging at TRACE level (without consuming the stream)
    if (logger.shouldLog(LogLevel.TRACE)) {
      const chunks: Buffer[] = [];
      const originalOn = req.on.bind(req);
      
      // Intercept data events to capture body
      req.on = function (event: string, listener: (...args: unknown[]) => void) {
        if (event === 'data') {
          return originalOn('data', (chunk: Buffer) => {
            chunks.push(chunk);
            listener(chunk);
          });
        }
        return originalOn(event, listener);
      } as typeof req.on;
      
      // Log body when complete
      req.once('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          logger.trace('Request body', { body: JSON.parse(body) });
        } catch (e) {
          logger.debug('Could not parse request body for logging');
        }
      });
    }
    
    try {
      // Handle the incoming message through the transport
      await transport.handlePostMessage(req, res);
      
      const duration = Date.now() - startTime;
      logger.debug(`Request processed successfully`, { duration: `${duration}ms` });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error handling POST message', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        sessionId,
        duration: `${duration}ms`,
      });
      
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process message' });
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
    logger.info('TinyTask MCP server running on SSE');
    logger.info(`URL: http://${host}:${port}/mcp`);
    logger.info(`Health: http://${host}:${port}/health`);
    logger.info(`Database: ${process.env.TINYTASK_DB_PATH || './data/tinytask.db'}`);
    logger.info('Mode: SSE');
    logger.info('Press Ctrl+C to stop');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    httpServer.close(async () => {
      logger.info('Server closed');
      await server.close();
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
