/**
 * SSE transport for MCP server
 * Enables remote multi-agent access over HTTP
 */

import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../utils/index.js';
import { v4 as uuidv4 } from 'uuid';
import { createMcpServer } from './mcp-server.js';

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
export async function startSseServer(
  taskService: import('../services/task-service.js').TaskService,
  commentService: import('../services/comment-service.js').CommentService,
  linkService: import('../services/link-service.js').LinkService,
  options?: SseServerOptions
): Promise<void> {
  const app = express();
  const port = options?.port ?? parseInt(process.env.TINYTASK_PORT || '3000');
  const host = options?.host ?? process.env.TINYTASK_HOST ?? '0.0.0.0';

  // Store active transports by session ID - each session gets its own MCP Server instance
  const sessions = new Map<string, { transport: SSEServerTransport; server: Server }>();

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
    logger.info('🔌 NEW SSE CONNECTION REQUEST', {
      clientIp: req.ip,
      currentSessionCount: sessions.size,
      existingSessions: Array.from(sessions.keys()),
      timestamp: new Date().toISOString(),
    });

    const transport = new SSEServerTransport('/mcp', res);
    const sessionId = transport.sessionId;
    
    // Create a NEW MCP Server instance for this session
    const sessionServer = createMcpServer(taskService, commentService, linkService);
    
    // Store session with its own server instance
    sessions.set(sessionId, { transport, server: sessionServer });
    
    logger.info('✅ SSE SESSION ESTABLISHED', {
      sessionId,
      clientIp: req.ip,
      totalActiveSessions: sessions.size,
      allActiveSessions: Array.from(sessions.keys()),
      timestamp: new Date().toISOString(),
    });
    
    // Instrument the response object to track SSE writes
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const responseSessionId = sessionId; // Capture the session ID for this specific response
    
    res.write = function(chunk: unknown, ...args: unknown[]): boolean {
      logger.info('📡 SSE EVENT WRITE', {
        sessionId: responseSessionId,
        transportSessionId: transport.sessionId,
        sessionMatch: responseSessionId === transport.sessionId,
        chunkSize: chunk ? Buffer.byteLength(chunk as string) : 0,
        chunkPreview: chunk ? String(chunk).substring(0, 200) : '',
        writable: res.writable,
        headersSent: res.headersSent,
        timestamp: new Date().toISOString(),
      });
      return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...args);
    };
    
    res.end = function(chunk?: unknown, ...args: unknown[]): typeof res {
      logger.info('📡 SSE CONNECTION END', {
        sessionId,
        hadChunk: !!chunk,
        timestamp: new Date().toISOString(),
      });
      return (originalEnd as (...args: unknown[]) => typeof res)(chunk, ...args);
    };
    
    // Monitor response state periodically
    const monitorInterval = setInterval(() => {
      if (!res.writable) {
        logger.warn('⚠️ SSE response became non-writable', {
          sessionId,
          writableEnded: res.writableEnded,
          destroyed: res.destroyed,
        });
        clearInterval(monitorInterval);
      }
    }, 5000);
    
    // Connect the session's server instance to its transport
    logger.info('🔗 CONNECTING SESSION SERVER TO TRANSPORT', {
      sessionId,
      timestamp: new Date().toISOString(),
    });
    await sessionServer.connect(transport);
    logger.info('✅ SESSION SERVER CONNECTED', {
      sessionId,
      timestamp: new Date().toISOString(),
    });

    // Handle disconnect
    req.on('close', () => {
      logger.info('🔌 SSE CONNECTION CLOSED', {
        sessionId,
        remainingSessionCount: sessions.size - 1,
        timestamp: new Date().toISOString(),
      });
      clearInterval(monitorInterval);
      
      // Clean up the session
      const session = sessions.get(sessionId);
      if (session) {
        session.server.close().catch((err) => {
          logger.error('Error closing session server', { sessionId, error: err });
        });
      }
      sessions.delete(sessionId);
      
      logger.info('🗑️ SESSION REMOVED', {
        sessionId,
        remainingSessions: sessions.size,
        activeSessionIds: Array.from(sessions.keys()),
        timestamp: new Date().toISOString(),
      });
    });
  });

  // SSE endpoint for MCP protocol - POST handles client messages
  app.post('/mcp', async (req, res) => {
    // Disable timeouts for this request/response
    // This prevents Node.js from timing out long-running MCP operations
    req.setTimeout(0);
    res.setTimeout(0);
    
    const requestId = uuidv4();
    const startTime = Date.now();
    
    // The session ID should be in the request (check query params, headers, or body)
    // MCP SDK typically uses query parameters
    const sessionId = (req.query.sessionId as string) || (req.headers['x-session-id'] as string);
    
    logger.info(`MCP POST message received - Session: ${sessionId} - RequestID: ${requestId}`, {
      requestId,
      requestedSessionId: sessionId,
      availableSessionIds: Array.from(sessions.keys()),
      sessionCount: sessions.size,
    });
    
    if (!sessionId) {
      logger.warn('No session ID in POST request', {
        requestId,
        query: req.query,
        headers: req.headers,
      });
      res.status(400).json({ error: 'Missing session ID' });
      return;
    }
    
    const session = sessions.get(sessionId);
    
    if (!session) {
      logger.error(`❌ NO SESSION FOUND`, {
        requestId,
        requestedSession: sessionId,
        availableSessions: Array.from(sessions.keys()),
        sessionCount: sessions.size,
      });
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    const transport = session.transport;
    
    logger.info(`✅ FOUND SESSION - Using transport`, {
      requestId,
      requestedSessionId: sessionId,
      transportSessionId: transport.sessionId,
      sessionMatch: sessionId === transport.sessionId,
    });
    
    // Capture request body to log the actual MCP protocol message
    const chunks: Buffer[] = [];
    const originalOn = req.on.bind(req);
    
    // Intercept data events to capture body for logging
    req.on = function (event: string, listener: (...args: unknown[]) => void) {
      if (event === 'data') {
        return originalOn('data', (chunk: Buffer) => {
          chunks.push(chunk);
          listener(chunk);
        });
      }
      return originalOn(event, listener);
    } as typeof req.on;
    
    // Capture response to log what's sent back
    const responseChunks: Buffer[] = [];
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    
    res.write = function (chunk: unknown, ...args: unknown[]): boolean {
      if (chunk) {
        responseChunks.push(Buffer.from(chunk as string));
      }
      // Call original with proper type handling
      return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...args);
    };
    
    res.end = function (chunk?: unknown, ...args: unknown[]): typeof res {
      if (chunk) {
        responseChunks.push(Buffer.from(chunk as string));
      }
      // Call original with proper type handling
      return (originalEnd as (...args: unknown[]) => typeof res)(chunk, ...args);
    };
    
    // Log body when request completes
    req.once('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const mcpRequest = JSON.parse(body);
        
        // Extract meaningful details from the MCP request
        const requestDetails = extractMcpRequestDetails(mcpRequest);
        
        logger.info('📨 MCP REQUEST DETAILS', {
          requestId,
          sessionId,
          method: requestDetails.method,
          toolName: requestDetails.toolName,
          resourceUri: requestDetails.resourceUri,
          params: requestDetails.params, // Log actual parameters
          timestamp: new Date().toISOString(),
        });
        
        // Log full request at debug level
        logger.debug('Full MCP request', {
          requestId,
          mcpRequest,
        });
        
      } catch (e) {
        logger.warn('Could not parse MCP request body for logging', {
          requestId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
    
    try {
      logger.info('🔄 CALLING transport.handlePostMessage', {
        requestId,
        sessionId,
        transportExists: !!transport,
        timestamp: new Date().toISOString(),
      });
      
      // Handle the incoming message through the transport
      await transport.handlePostMessage(req, res);
      
      const duration = Date.now() - startTime;
      
      logger.info('✅ transport.handlePostMessage COMPLETED', {
        requestId,
        sessionId,
        duration: `${duration}ms`,
        responseHeadersSent: res.headersSent,
        responseStatusCode: res.statusCode,
        timestamp: new Date().toISOString(),
      });
      
      // Log response content
      try {
        const responseBody = Buffer.concat(responseChunks).toString('utf8');
        if (responseBody) {
          // Try to parse as JSON for better logging
          try {
            const responseJson = JSON.parse(responseBody);
            logger.info('📤 MCP POST RESPONSE', {
              requestId,
              sessionId,
              duration: `${duration}ms`,
              statusCode: res.statusCode,
              response: responseJson,
              timestamp: new Date().toISOString(),
            });
          } catch {
            // Not JSON, log as string
            logger.info('📤 MCP POST RESPONSE', {
              requestId,
              sessionId,
              duration: `${duration}ms`,
              statusCode: res.statusCode,
              responseBody: responseBody.substring(0, 500), // Truncate long responses
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          logger.info('📤 MCP POST REQUEST COMPLETED (no body)', {
            requestId,
            sessionId,
            duration: `${duration}ms`,
            statusCode: res.statusCode,
            headersSent: res.headersSent,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (e) {
        logger.warn('Could not log response body', {
          requestId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      
      // Verify response was actually sent
      if (!res.headersSent) {
        logger.error('⚠️ RESPONSE HEADERS NOT SENT!', {
          requestId,
          sessionId,
          duration: `${duration}ms`,
        });
      }
      
      // Now check if the SSE transport is supposed to send the actual result
      // The 202 Accepted is just acknowledgment - the real result should go over SSE
      logger.info('⏳ Waiting for tool result to be sent over SSE stream...', {
        requestId,
        sessionId,
        sseTransportActive: sessions.has(sessionId),
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('❌ MCP REQUEST FAILED', {
        requestId,
        sessionId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
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

  // Configure HTTP timeouts for long-lived SSE connections
  // Disable timeouts to prevent Node.js from closing SSE connections prematurely
  httpServer.timeout = 0; // Disable request timeout (default: 120000ms)
  httpServer.keepAliveTimeout = 0; // Disable keep-alive timeout (default: 5000ms)
  httpServer.headersTimeout = 0; // Disable headers timeout (default: 60000ms)
  
  logger.info('HTTP timeouts disabled for SSE long-lived connections');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
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

/**
 * Extract meaningful details from an MCP protocol request for logging
 */
function extractMcpRequestDetails(mcpRequest: unknown): {
  method: string;
  toolName?: string;
  resourceUri?: string;
  params?: unknown;
} {
  if (!mcpRequest || typeof mcpRequest !== 'object') {
    return { method: 'unknown' };
  }
  
  const req = mcpRequest as Record<string, unknown>;
  
  // Extract the method
  const method = typeof req.method === 'string' ? req.method : 'unknown';
  
  // Check if it's a tool call
  if (method === 'tools/call' && req.params && typeof req.params === 'object') {
    const params = req.params as Record<string, unknown>;
    return {
      method,
      toolName: params.name as string,
      params: params.arguments, // Return actual parameters
    };
  }
  
  // Check if it's a resource read
  if (method === 'resources/read' && req.params && typeof req.params === 'object') {
    const params = req.params as Record<string, unknown>;
    return {
      method,
      resourceUri: params.uri as string,
      params: req.params, // Return full params for resources
    };
  }
  
  // For other methods, return the params
  return {
    method,
    params: req.params,
  };
}
