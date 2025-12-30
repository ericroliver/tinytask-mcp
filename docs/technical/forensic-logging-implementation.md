# Forensic Logging Implementation Plan

## Overview
This document provides the detailed technical implementation plan for adding forensic-level logging to the TinyTask MCP server. This will enable comprehensive debugging of agent interactions, particularly for troubleshooting issues like the current goose agent task creation problem.

## Architecture

### Logger Module Design

The logger will be implemented as a singleton utility that provides structured, level-based logging throughout the application.

```typescript
// src/utils/logger.ts

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export class Logger {
  private static instance: Logger;
  private level: LogLevel;
  private enableTimestamp: boolean;
  
  private constructor() {
    const levelStr = (process.env.TINYTASK_LOG_LEVEL || 'info').toLowerCase();
    this.level = this.parseLevel(levelStr);
    this.enableTimestamp = true;
  }
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  private parseLevel(level: string): LogLevel {
    switch (level) {
      case 'error': return LogLevel.ERROR;
      case 'warn': return LogLevel.WARN;
      case 'info': return LogLevel.INFO;
      case 'debug': return LogLevel.DEBUG;
      case 'trace': return LogLevel.TRACE;
      default: return LogLevel.INFO;
    }
  }
  
  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }
  
  private formatMessage(level: string, message: string, context?: unknown): string {
    const timestamp = this.enableTimestamp 
      ? `[${new Date().toISOString()}]` 
      : '';
    const prefix = `${timestamp} ${level}:`;
    
    if (context === undefined) {
      return `${prefix} ${message}`;
    }
    
    // Format context object
    const contextStr = typeof context === 'string' 
      ? context 
      : JSON.stringify(context, null, 2);
    
    return `${prefix} ${message}\n${contextStr}`;
  }
  
  error(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, context));
    }
  }
  
  warn(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.error(this.formatMessage('WARN', message, context));
    }
  }
  
  info(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.error(this.formatMessage('INFO', message, context));
    }
  }
  
  debug(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.error(this.formatMessage('DEBUG', message, context));
    }
  }
  
  trace(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      console.error(this.formatMessage('TRACE', message, context));
    }
  }
  
  // Specialized helper methods
  
  logRequest(method: string, path: string, details: {
    sessionId?: string;
    headers?: Record<string, unknown>;
    body?: unknown;
  }): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      this.trace('HTTP Request', {
        method,
        path,
        ...details
      });
    }
  }
  
  logResponse(status: number, details: {
    duration?: number;
    body?: unknown;
  }): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      this.trace('HTTP Response', {
        status,
        ...details
      });
    }
  }
  
  logToolCall(name: string, args: unknown): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const context = this.shouldLog(LogLevel.TRACE) 
        ? { fullArgs: args }
        : { args: this.sanitizeArgs(args) };
      
      this.debug(`Tool call: ${name}`, context);
    }
  }
  
  logToolResult(name: string, result: unknown, duration?: number): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const context: Record<string, unknown> = {};
      
      if (duration !== undefined) {
        context.duration = `${duration}ms`;
      }
      
      if (this.shouldLog(LogLevel.TRACE)) {
        context.result = result;
      }
      
      this.debug(`Tool result: ${name}`, context);
    }
  }
  
  logToolError(name: string, error: Error, args?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.error(`Tool error: ${name}`, {
        error: error.message,
        stack: error.stack,
        args: this.sanitizeArgs(args)
      });
    }
  }
  
  private sanitizeArgs(args: unknown): unknown {
    // Basic sanitization - remove deeply nested objects for readability
    // In TRACE mode, full args are logged anyway
    if (typeof args !== 'object' || args === null) {
      return args;
    }
    
    // For arrays, show count
    if (Array.isArray(args)) {
      return `[Array: ${args.length} items]`;
    }
    
    // For objects, show keys
    const obj = args as Record<string, unknown>;
    return Object.keys(obj).reduce((acc, key) => {
      const value = obj[key];
      if (typeof value === 'object' && value !== null) {
        acc[key] = Array.isArray(value) 
          ? `[Array: ${value.length} items]`
          : '[Object]';
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, unknown>);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
```

## Implementation Changes by File

### 1. Create Logger Utility

**File**: `src/utils/logger.ts` (NEW)
- Implement Logger class as shown above
- Export singleton instance

**File**: `src/utils/index.ts` (NEW)
```typescript
export { logger, Logger, LogLevel } from './logger.js';
```

### 2. Update SSE Server

**File**: `src/server/sse.ts`

#### Changes Required:

1. **Import logger**
```typescript
import { logger } from '../utils/index.js';
```

2. **Add request capture middleware** (before existing middleware)
```typescript
// Request logging middleware - captures body for logging
app.use((req, res, next) => {
  if (req.path === '/mcp' && req.method === 'POST') {
    // Skip for MCP POST - will handle specially
    next();
  } else {
    next();
  }
});
```

3. **Update GET /mcp endpoint**
```typescript
app.get('/mcp', async (req, res) => {
  logger.info(`New SSE connection from ${req.ip}`);
  
  const transport = new SSEServerTransport('/mcp', res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  
  logger.info(`SSE session established: ${sessionId}`);
  logger.debug('Transport details', { sessionId, clientIp: req.ip });
  
  await server.connect(transport);

  req.on('close', () => {
    logger.info(`SSE connection closed: ${sessionId}`);
    transports.delete(sessionId);
  });
});
```

4. **Update POST /mcp endpoint with detailed logging**
```typescript
app.post('/mcp', async (req, res) => {
  const startTime = Date.now();
  
  logger.info('MCP POST message received');
  
  // Log request details
  const sessionId = (req.query.sessionId as string) || (req.headers['x-session-id'] as string);
  
  logger.trace('Request headers', {
    headers: req.headers,
    sessionId
  });
  
  if (!sessionId) {
    logger.warn('No session ID in POST request', {
      query: req.query,
      headers: req.headers
    });
    res.status(400).json({ error: 'Missing session ID' });
    return;
  }
  
  const transport = transports.get(sessionId);
  
  if (!transport) {
    logger.error(`No transport found for session: ${sessionId}`, {
      availableSessions: Array.from(transports.keys())
    });
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  // Capture request body for logging (without consuming the stream)
  if (logger.shouldLog(LogLevel.TRACE)) {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
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
      duration: `${duration}ms`
    });
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process message' });
    }
  }
});
```

5. **Update other logging calls**
```typescript
// Health check - keep as is (no need for structured logging)

// Error handler
app.use(
  (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Server error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
    res.status(500).json({ error: 'Internal server error' });
  }
);

// Startup
const httpServer = app.listen(port, host, () => {
  logger.info('TinyTask MCP server running on SSE');
  logger.info(`URL: http://${host}:${port}/mcp`);
  logger.info(`Health: http://${host}:${port}/health`);
  logger.info(`Database: ${process.env.TINYTASK_DB_PATH || './data/tinytask.db'}`);
  logger.info('Mode: SSE');
  logger.info('Press Ctrl+C to stop');
});

// Shutdown
const shutdown = async () => {
  logger.info('Shutting down...');
  httpServer.close(async () => {
    logger.info('Server closed');
    await server.close();
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};
```

### 3. Update Tool Handlers

**File**: `src/tools/tool-handlers.ts`

```typescript
import { logger } from '../utils/index.js';

// In registerToolHandlers function, update CallTool handler:

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  logger.debug(`Tool call received: ${name}`);
  logger.trace('Tool call arguments', { name, args });

  try {
    // Validate arguments against schema
    const schema = toolSchemas[name as keyof typeof toolSchemas];
    if (!schema) {
      logger.warn(`Unknown tool requested: ${name}`);
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }

    // Parse and validate arguments
    const validatedArgs = schema.parse(args || {});
    logger.debug(`Tool arguments validated: ${name}`);

    // Route to appropriate handler
    let result;
    switch (name) {
      case 'create_task':
        logger.debug('Executing create_task handler');
        result = await createTaskHandler(taskService, validatedArgs as CreateTaskParams);
        break;
      // ... other cases ...
      default:
        logger.warn(`Unknown tool in switch: ${name}`);
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }

    const duration = Date.now() - startTime;
    logger.debug(`Tool execution completed: ${name}`, { duration: `${duration}ms` });
    logger.trace('Tool execution result', { name, result });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`Tool execution failed: ${name}`, {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      args: logger.sanitizeArgs(args),
      duration: `${duration}ms`
    });
    
    return {
      content: [
        {
          type: 'text',
          text: `Error calling tool ${name}: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});
```

### 4. Update Task Tools (Example)

**File**: `src/tools/task-tools.ts`

```typescript
import { logger } from '../utils/index.js';

export async function createTaskHandler(
  taskService: TaskService,
  params: {
    title: string;
    description?: string;
    assigned_to?: string;
    created_by?: string;
    priority?: number;
    tags?: string[];
  }
) {
  try {
    logger.debug('Creating task', { title: params.title, assigned_to: params.assigned_to });
    logger.trace('Full task creation params', params);
    
    const task = taskService.create(params);
    
    logger.info(`Task created successfully: ${task.id}`, { title: task.title });
    logger.trace('Created task details', task);
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to create task', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      params
    });
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating task: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

### 5. Update Main Entry Point

**File**: `src/index.ts`

```typescript
import { logger } from './utils/index.js';

async function main() {
  try {
    // Load configuration
    const mode = process.env.TINYTASK_MODE || 'both';
    const dbPath = process.env.TINYTASK_DB_PATH || './data/tinytask.db';
    const port = parseInt(process.env.TINYTASK_PORT || '3000', 10);
    const host = process.env.TINYTASK_HOST || '0.0.0.0';
    const logLevel = process.env.TINYTASK_LOG_LEVEL || 'info';

    // Print startup banner
    logger.info('='.repeat(50));
    logger.info('TinyTask MCP Server');
    logger.info('='.repeat(50));
    logger.info(`Mode: ${mode}`);
    logger.info(`Database: ${dbPath}`);
    logger.info(`Log Level: ${logLevel}`);
    if (mode === 'sse' || mode === 'both') {
      logger.info(`Host: ${host}`);
      logger.info(`Port: ${port}`);
    }
    logger.info('='.repeat(50));

    // Validate mode
    if (!['stdio', 'sse', 'both'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Must be stdio, sse, or both`);
    }

    // Initialize database
    logger.info('Initializing database...');
    const db = initializeDatabase(dbPath);
    logger.info('✓ Database initialized');

    // Create services
    logger.info('Creating services...');
    const taskService = new TaskService(db);
    const commentService = new CommentService(db);
    const linkService = new LinkService(db);
    logger.info('✓ Services created');

    // Create MCP server
    logger.info('Creating MCP server...');
    const server = createMcpServer(taskService, commentService, linkService);
    logger.info('✓ MCP server created');

    // Start appropriate transport(s)
    if (mode === 'stdio' || mode === 'both') {
      logger.info('Starting stdio transport...');
      if (mode === 'both') {
        startStdioServer(server).catch((error) => {
          logger.error('Stdio transport error', error);
        });
        logger.info('✓ Stdio transport started');
      } else {
        await startStdioServer(server);
      }
    }

    if (mode === 'sse' || mode === 'both') {
      logger.info('Starting SSE transport...');
      await startSseServer(server, { port, host });
      logger.info('✓ SSE transport started');
    }

    logger.info('='.repeat(50));
    logger.info('Server ready!');
    logger.info('='.repeat(50));
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Handle graceful shutdown
function setupShutdownHandlers() {
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: String(reason),
    promise: String(promise)
  });
  process.exit(1);
});
```

### 6. Update Stdio Server

**File**: `src/server/stdio.ts`

```typescript
import { logger } from '../utils/index.js';

export async function startStdioServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  
  // Connect server to transport
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  logger.info('TinyTask MCP server running on stdio');
  logger.info(`Database: ${process.env.TINYTASK_DB_PATH || './data/tinytask.db'}`);
  logger.info('Mode: stdio');
  logger.info('Press Ctrl+C to stop');

  const shutdown = async () => {
    logger.info('Shutting down...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

## Configuration Updates

### Docker Compose

**File**: `docker-compose.yml`

```yaml
environment:
  # Server mode
  TINYTASK_MODE: sse
  
  # SSE configuration
  TINYTASK_PORT: 3000
  TINYTASK_HOST: 0.0.0.0
  
  # Database
  TINYTASK_DB_PATH: /data/tinytask.db
  
  # Logging - change to 'trace' for forensic debugging
  TINYTASK_LOG_LEVEL: info  # Options: error, warn, info, debug, trace
  
  # Node environment
  NODE_ENV: production
```

### README Updates

**File**: `README.md`

Add section on logging configuration:

```markdown
## Logging Configuration

TinyTask MCP supports multiple logging levels for debugging and troubleshooting:

### Log Levels

- `error`: Only errors (minimal production logging)
- `warn`: Warnings and errors
- `info`: Important operations (default)
- `debug`: Detailed debugging information
- `trace`: Full forensic logging with request/response bodies

### Configuration

Set the `TINYTASK_LOG_LEVEL` environment variable:

```bash
# Development - full forensic logging
export TINYTASK_LOG_LEVEL=trace
npm run dev

# Production - errors only
export TINYTASK_LOG_LEVEL=error
npm start
```

### Docker Configuration

Update `docker-compose.yml`:

```yaml
environment:
  TINYTASK_LOG_LEVEL: trace  # Enable forensic logging
```

### Troubleshooting Agent Issues

If an agent (like goose) is having issues creating tasks:

1. Enable trace logging:
   ```bash
   docker-compose down
   # Edit docker-compose.yml, set TINYTASK_LOG_LEVEL: trace
   docker-compose up -d
   ```

2. Watch logs in real-time:
   ```bash
   docker-compose logs -f tinytask
   ```

3. Look for:
   - Full request body showing what the agent sent
   - Validation errors
   - Database errors
   - Full response body showing what was returned

4. Return to normal logging:
   ```bash
   docker-compose down
   # Edit docker-compose.yml, set TINYTASK_LOG_LEVEL: info
   docker-compose up -d
   ```
```

## Testing Strategy

### Unit Tests for Logger

**File**: `tests/unit/logger.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../../src/utils/logger.js';

describe('Logger', () => {
  let originalEnv: string | undefined;
  
  beforeEach(() => {
    originalEnv = process.env.TINYTASK_LOG_LEVEL;
  });
  
  afterEach(() => {
    process.env.TINYTASK_LOG_LEVEL = originalEnv;
  });
  
  it('should default to INFO level', () => {
    delete process.env.TINYTASK_LOG_LEVEL;
    const logger = new Logger();
    expect(logger.shouldLog(LogLevel.INFO)).toBe(true);
    expect(logger.shouldLog(LogLevel.DEBUG)).toBe(false);
  });
  
  it('should respect TRACE level', () => {
    process.env.TINYTASK_LOG_LEVEL = 'trace';
    const logger = new Logger();
    expect(logger.shouldLog(LogLevel.TRACE)).toBe(true);
    expect(logger.shouldLog(LogLevel.DEBUG)).toBe(true);
  });
  
  it('should respect ERROR level', () => {
    process.env.TINYTASK_LOG_LEVEL = 'error';
    const logger = new Logger();
    expect(logger.shouldLog(LogLevel.ERROR)).toBe(true);
    expect(logger.shouldLog(LogLevel.INFO)).toBe(false);
  });
  
  // Add more tests for sanitization, formatting, etc.
});
```

### Integration Tests

Update existing integration tests to verify logging doesn't break functionality.

### Manual Testing Checklist

1. **Default Behavior (INFO)**
   - [ ] Start server with default config
   - [ ] Verify startup messages appear
   - [ ] Verify request summary appears
   - [ ] Verify no detailed request/response bodies

2. **Trace Logging**
   - [ ] Set TINYTASK_LOG_LEVEL=trace
   - [ ] Create a task via API
   - [ ] Verify full request body logged
   - [ ] Verify full response body logged
   - [ ] Verify timestamps present
   - [ ] Verify tool invocation logged

3. **Error Logging**
   - [ ] Set TINYTASK_LOG_LEVEL=error
   - [ ] Verify no INFO messages
   - [ ] Cause an error (invalid task)
   - [ ] Verify error logged with context

4. **Performance**
   - [ ] Run load test with INFO level
   - [ ] Run load test with TRACE level
   - [ ] Verify < 5ms overhead per request

## Migration Checklist

- [ ] Create logger utility (`src/utils/logger.ts`)
- [ ] Create utils index (`src/utils/index.ts`)
- [ ] Update `src/server/sse.ts`
- [ ] Update `src/server/stdio.ts`
- [ ] Update `src/index.ts`
- [ ] Update `src/tools/tool-handlers.ts`
- [ ] Update `src/tools/task-tools.ts`
- [ ] Update `src/tools/comment-tools.ts`
- [ ] Update `src/tools/link-tools.ts`
- [ ] Update `docker-compose.yml`
- [ ] Update `README.md`
- [ ] Create unit tests for logger
- [ ] Update integration tests
- [ ] Test with goose agent
- [ ] Update troubleshooting documentation

## Performance Considerations

### Conditional Logging
The `shouldLog()` check happens before any expensive operations:
```typescript
if (this.shouldLog(LogLevel.TRACE)) {
  // Only perform expensive serialization if needed
  this.trace('Data', expensiveOperation());
}
```

### Stream Handling
For request body capture in SSE:
- TRACE level: Capture and log full body
- Other levels: Skip capture entirely
- No impact on SDK's ability to read the stream

### Memory
- Log messages written to stderr immediately
- No buffering or queuing
- Docker handles log rotation

## Security Notes

### Current Scope
- No sensitive data filtering in initial implementation
- All data logged as-is
- Appropriate for private deployments only

### Future Enhancements
- Add field filtering (e.g., passwords, tokens)
- Add sanitization configuration
- Add option to disable body logging even in TRACE mode

## Rollout Plan

### Phase 1: Core Implementation
1. Create logger utility
2. Update main entry point
3. Update stdio server
4. Basic integration tests

### Phase 2: HTTP Logging
1. Update SSE server with request/response logging
2. Add duration tracking
3. Integration testing

### Phase 3: Tool Instrumentation
1. Update tool handlers
2. Update all tool implementations
3. Service layer updates

### Phase 4: Documentation & Testing
1. Update README
2. Create troubleshooting guide
3. Comprehensive testing with agents
4. Performance validation
