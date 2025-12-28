# Story: Forensic-Level Request/Response Logging

## Overview
Implement comprehensive, environment-controlled logging to enable forensic-level debugging of MCP protocol interactions, particularly for troubleshooting agent integration issues.

## Problem Statement
When agents (like goose) interact with the TinyTask MCP server, issues can occur that are difficult to debug with current minimal logging. The current log output `"MCP POST message received"` provides no visibility into:
- What data the agent is sending
- How the server is responding
- Where in the request/response cycle failures occur
- Validation errors or data format issues

## Requirements

### Functional Requirements
1. **Logging Levels**: Support standard logging hierarchy with environment control
   - `error`: Only errors (minimal production logging)
   - `warn`: Warnings and errors
   - `info`: Important operations, warnings, and errors (current default)
   - `debug`: Detailed debugging including operation summaries
   - `trace`: Full forensic logging with complete request/response bodies

2. **Request Logging** (trace level): Capture and log:
   - HTTP method, path, headers
   - Session ID
   - Complete request body (JSON payloads)
   - Timestamp

3. **Response Logging** (trace level): Capture and log:
   - HTTP status code
   - Response headers
   - Complete response body
   - Processing duration
   - Timestamp

4. **Tool Invocation Logging** (debug level): Log:
   - Tool name being called
   - Validated arguments (sanitized)
   - Execution start/end
   - Results or errors

5. **Error Context**: Enhanced error logging with:
   - Stack traces
   - Request context that caused the error
   - Service layer errors with full context

### Non-Functional Requirements
1. **Performance**: Trace logging must not significantly impact performance when disabled
2. **Security**: Sensitive data should be sanitizable (future enhancement)
3. **Backward Compatibility**: Default behavior should match current logging
4. **Configuration**: Single environment variable control
5. **Format**: Structured JSON output option for log aggregation tools

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Environment Config                   │
│              TINYTASK_LOG_LEVEL=trace                │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              Logger Utility Module                   │
│  - Level filtering                                   │
│  - Structured logging                                │
│  - Request/Response formatting                       │
│  - Timestamp management                              │
└──────────────────┬──────────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
┌─────────────┐        ┌──────────────────┐
│ HTTP Layer  │        │  Tool Handler    │
│  (SSE)      │        │     Layer        │
│             │        │                  │
│ - Request   │        │ - Tool calls     │
│   capture   │        │ - Validation     │
│ - Response  │        │ - Execution      │
│   intercept │        │ - Results        │
└─────────────┘        └──────────────────┘
```

### Component Design

#### 1. Logger Utility (`src/utils/logger.ts`)
```typescript
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

class Logger {
  private level: LogLevel;
  
  constructor(level: string) {
    this.level = this.parseLevel(level);
  }
  
  error(message: string, context?: unknown): void
  warn(message: string, context?: unknown): void
  info(message: string, context?: unknown): void
  debug(message: string, context?: unknown): void
  trace(message: string, context?: unknown): void
  
  // Specialized logging methods
  logRequest(req: Request): void
  logResponse(res: Response, duration: number): void
  logToolCall(name: string, args: unknown): void
  logToolResult(name: string, result: unknown): void
}
```

#### 2. Request/Response Middleware (`src/server/sse.ts`)
- Add middleware to capture request bodies before SDK processing
- Use buffer approach to preserve stream for SDK
- Log at appropriate points in request lifecycle
- Track request duration for performance insights

#### 3. Tool Handler Instrumentation (`src/tools/tool-handlers.ts`)
- Add logging wrapper around tool execution
- Log at DEBUG level: tool name, sanitized arguments
- Log at TRACE level: full arguments and results
- Enhanced error logging with full context

#### 4. Service Layer Logging
- Add DEBUG level logging to service operations
- Log database query patterns (without sensitive data)
- Log service errors with operation context

### Configuration

#### Environment Variable
```bash
TINYTASK_LOG_LEVEL=trace
```

Valid values: `error`, `warn`, `info` (default), `debug`, `trace`

#### Docker Compose Update
```yaml
environment:
  TINYTASK_LOG_LEVEL: trace  # Change from 'info' to enable forensics
```

### Log Output Examples

#### Current (INFO level)
```
MCP POST message received
```

#### With TRACE level enabled
```
[2025-12-27T18:45:00.123Z] INFO: MCP POST message received
[2025-12-27T18:45:00.124Z] TRACE: Request Details
  Method: POST
  Path: /mcp
  Session ID: abc123
  Headers: {
    "content-type": "application/json",
    "content-length": "256"
  }
  Body: {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_task",
      "arguments": {
        "title": "Test Task",
        "description": "Testing task creation",
        "assigned_to": "goose",
        "priority": 1
      }
    }
  }

[2025-12-27T18:45:00.125Z] DEBUG: Tool call: create_task
  Args: { title: "Test Task", assigned_to: "goose", priority: 1 }

[2025-12-27T18:45:00.135Z] DEBUG: Tool execution completed: create_task
  Duration: 10ms

[2025-12-27T18:45:00.136Z] TRACE: Response Details
  Status: 200
  Duration: 12ms
  Body: {
    "jsonrpc": "2.0",
    "id": 1,
    "result": {
      "content": [{
        "type": "text",
        "text": "{ \"id\": 42, \"title\": \"Test Task\", ... }"
      }]
    }
  }
```

#### With ERROR in Tool Execution
```
[2025-12-27T18:45:00.135Z] ERROR: Tool execution failed: create_task
  Error: Invalid argument: title is required
  Args: { description: "Testing without title" }
  Stack: Error: Invalid argument: title is required
    at validateTask (task-tools.ts:45)
    at createTaskHandler (task-tools.ts:18)
    ...
```

### Implementation Phases

#### Phase 1: Core Logger Utility
- Create logger utility with level filtering
- Basic structured logging
- Integration into existing console.error calls

#### Phase 2: HTTP Layer Instrumentation
- Request body capture middleware
- Response interception
- Duration tracking

#### Phase 3: Tool Handler Instrumentation
- Add logging to tool handlers
- Validation error logging
- Result logging

#### Phase 4: Service Layer Enhancement
- Add debug logging to services
- Database operation logging
- Error context enhancement

## Acceptance Criteria

### Core Functionality
- [ ] Logger utility supports all 5 log levels (error, warn, info, debug, trace)
- [ ] TINYTASK_LOG_LEVEL environment variable controls logging
- [ ] Default log level is 'info' (maintains current behavior)
- [ ] All existing console.error calls migrated to logger

### Forensic Logging (TRACE)
- [ ] Full request body logged for POST /mcp
- [ ] Full response body logged for POST /mcp
- [ ] Request/response includes timestamps
- [ ] Request duration calculated and logged

### Debug Logging (DEBUG)
- [ ] Tool invocations logged with sanitized arguments
- [ ] Tool results logged
- [ ] Service operations logged
- [ ] Errors include full context

### Performance
- [ ] No measurable performance impact when logging is at INFO or lower
- [ ] Trace logging overhead < 5ms per request

### Documentation
- [ ] README updated with logging configuration
- [ ] Environment variable documented
- [ ] Troubleshooting guide includes logging examples
- [ ] Docker compose includes logging configuration example

## Testing Strategy

### Unit Tests
- Logger utility level filtering
- Log message formatting
- Context serialization

### Integration Tests
- Verify log output at each level
- Verify request/response capture
- Verify tool invocation logging

### Manual Testing
- Test with goose agent creating tasks
- Verify full request/response visibility
- Test error scenarios
- Test performance with trace logging enabled/disabled

## Migration Notes

### Backward Compatibility
- Default log level remains 'info'
- All existing log output preserved
- No breaking changes to API or behavior

### Deployment
- Update docker-compose.yml with TINYTASK_LOG_LEVEL
- Update README with configuration instructions
- Update troubleshooting guide

## Security Considerations

### Current Implementation
- No sensitive data filtering (future enhancement)
- Logs written to stderr (appropriate for Docker)
- No log rotation (relies on container log management)

### Future Enhancements
- Add sensitive field filtering (passwords, tokens, etc.)
- Add option for JSON structured logging
- Add log sanitization configuration

## Related Stories
- Future: Structured JSON logging for log aggregation
- Future: Sensitive data filtering
- Future: Log rotation and archival
- Future: Metrics and observability integration
