# Forensic Logging Enhancement

## Problem Statement

The MCP server was experiencing agent hangs in production, but the logs provided insufficient diagnostic information:

- No visibility into which MCP methods were being called
- No tool or resource names in logs
- No request IDs for correlation
- **No request parameter values** - couldn't see what arguments were passed
- **No response content** - couldn't see what the server sent back
- Impossible to determine what the hung agent was requesting or receiving

## Solution: Complete Forensic Logging

Enhanced the SSE transport layer with comprehensive request/response tracking and logging.

## What's Now Logged

### For Every MCP Request

Each request now generates structured log entries with:

1. **Request ID** - Unique UUID for correlation across log entries
2. **Session ID** - SSE session identifier
3. **MCP Method** - The protocol method (tools/call, resources/read, etc.)
4. **Tool Name** - For tool invocations (e.g., `signup_for_task`)
5. **Resource URI** - For resource reads (e.g., `queue://github`)
6. **Request Parameters** - The actual arguments/parameters passed to tools/resources
7. **Response Content** - The full response sent back to the client
8. **Duration** - Request processing time in milliseconds
9. **Timestamps** - ISO 8601 timestamps for temporal analysis
10. **Status Code** - HTTP response status

### Log Entry Examples

#### Tool Call Request with Parameters
```
[2026-01-04T17:45:00.123Z] INFO: MCP POST message received - Session: a25d3990-... - RequestID: 8f7e6d5c-...
[2026-01-04T17:45:00.124Z] INFO: 📨 MCP REQUEST DETAILS {
  "requestId": "8f7e6d5c-...",
  "sessionId": "a25d3990-...",
  "method": "tools/call",
  "toolName": "signup_for_task",
  "params": {
    "agent_name": "github"
  },
  "timestamp": "2026-01-04T17:45:00.124Z"
}
[2026-01-04T17:45:00.145Z] INFO: 📤 MCP RESPONSE {
  "requestId": "8f7e6d5c-...",
  "sessionId": "a25d3990-...",
  "duration": "21ms",
  "statusCode": 202,
  "response": {
    "content": [{
      "type": "text",
      "text": "Task #123: Create GitHub Issues"
    }]
  },
  "timestamp": "2026-01-04T17:45:00.145Z"
}
```

#### Resource Read Request with Response
```
[2026-01-04T17:45:10.234Z] INFO: 📨 MCP REQUEST DETAILS {
  "requestId": "9a8b7c6d-...",
  "sessionId": "a25d3990-...",
  "method": "resources/read",
  "resourceUri": "queue://github",
  "params": {
    "uri": "queue://github"
  },
  "timestamp": "2026-01-04T17:45:10.234Z"
}
[2026-01-04T17:45:10.250Z] INFO: 📤 MCP RESPONSE {
  "requestId": "9a8b7c6d-...",
  "sessionId": "a25d3990-...",
  "duration": "16ms",
  "statusCode": 202,
  "response": {
    "contents": [{
      "uri": "queue://github",
      "mimeType": "application/json",
      "text": "{\"tasks\":[{\"id\":123,\"title\":\"Create GitHub Issues\"}]}"
    }]
  },
  "timestamp": "2026-01-04T17:45:10.250Z"
}
```

#### Failed Request with Error Details
```
[2026-01-04T17:45:20.345Z] INFO: 📨 MCP REQUEST DETAILS {
  "requestId": "1b2c3d4e-...",
  "sessionId": "a25d3990-...",
  "method": "tools/call",
  "toolName": "get_task",
  "params": {
    "id": 999
  },
  "timestamp": "2026-01-04T17:45:20.345Z"
}
[2026-01-04T17:45:20.501Z] ERROR: ❌ MCP REQUEST FAILED {
  "requestId": "1b2c3d4e-...",
  "sessionId": "a25d3990-...",
  "duration": "156ms",
  "error": "Task not found",
  "stack": "Error: Task not found\n    at ...",
  "timestamp": "2026-01-04T17:45:20.501Z"
}
```

## Diagnostic Capabilities

### Identifying Hung Requests

When an agent hangs, the logs will show:

1. **Last successful request** - The last completed request before the hang
2. **Missing completion log** - A request with a start log but no completion log
3. **Request correlation** - Use the RequestID to trace a specific request through the system
4. **Session correlation** - Use SessionID to see all requests from a specific agent session

### Example Hang Diagnosis

```
# Agent starts working
[17:39:17] INFO: 📨 MCP REQUEST DETAILS { "method": "tools/call", "toolName": "signup_for_task" }
[17:39:17] INFO: 📤 MCP REQUEST COMPLETED { "duration": "6ms" }

# Agent makes a request but never completes
[17:39:18] INFO: 📨 MCP REQUEST DETAILS { "method": "resources/read", "resourceUri": "queue://github" }
# <-- NO COMPLETION LOG = HUNG REQUEST

# This clearly shows the agent hung while reading the queue resource
```

## Implementation Details

### Request Body Capture

The SSE POST handler now captures the raw request body by intercepting the request stream:

```typescript
const chunks: Buffer[] = [];
req.on('data', (chunk: Buffer) => {
  chunks.push(chunk);
});
req.once('end', () => {
  const body = Buffer.concat(chunks).toString('utf8');
  const mcpRequest = JSON.parse(body);
  // Extract and log details
});
```

### MCP Request Parsing

A helper function extracts meaningful details from MCP protocol messages:

- Identifies tool calls and extracts tool name
- Identifies resource reads and extracts URI
- Identifies other MCP methods (list, initialize, etc.)
- Handles malformed requests gracefully

### Request ID Generation

Each request gets a unique UUID for correlation:
- Generated at request start
- Included in all log entries for that request
- Allows tracing a request through distributed systems

## Debug Level Logging

For even more detailed diagnostics, set log level to DEBUG:

```bash
export TINYTASK_LOG_LEVEL=debug
```

This logs:
- Full MCP request bodies
- Full response bodies
- Additional internal state

## Dependencies Added

- `uuid` (^9.0.0) - UUID generation for request IDs
- `@types/uuid` (^9.0.0) - TypeScript types

## Files Modified

- [`src/server/sse.ts`](../../src/server/sse.ts) - Enhanced POST handler with forensic logging
- [`package.json`](../../package.json) - Added uuid dependencies

## Testing

All existing tests pass:
- ✅ Integration tests (75 tests)
- ✅ Performance tests
- ✅ Build successful
- ✅ Lint clean

## Usage

No configuration changes required. Enhanced logging is automatically active for all SSE connections.

## Next Time an Agent Hangs

1. Capture the full log output
2. Search for the agent's Session ID
3. Look for requests without completion logs
4. Check the method, tool name, or resource URI of the incomplete request
5. This will identify exactly what operation the agent was attempting when it hung
