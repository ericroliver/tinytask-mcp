# SSE Timeout Analysis

**Issue**: Agents interacting with the TinyTask MCP server experience timeouts on the first or second tool interaction after periods of inactivity. The client times out after ~300 seconds, retries, and then succeeds immediately.

**Date**: 2026-01-04  
**Status**: Analysis Complete - Awaiting Solution Approval

## Problem Statement

Clients connecting to the TinyTask MCP SSE server experience the following behavior:
1. Initial connection and handshake work fine (initialize, notifications/initialized, ping)
2. First tool call (tools/list or tools/call) appears to succeed on the server (logs show "Request processed successfully" in 0-1ms)
3. Client never receives response and times out after ~300 seconds
4. Client sends cancellation notification with "timed out" reason
5. Client immediately retries the same request, which succeeds instantly

## Log Analysis

### Key Observations

1. **SSE Connection Lifecycle**: Connections close approximately every 2 minutes (120 seconds)
   - Example: Session `95a1c8bc-b608-4b4b-9127-544c4466b72b` closed at 16:23:10.683, new session at 16:23:12.693

2. **Timeout Pattern**: 
   ```
   16:21:10.268 - Request ID 5 times out (notifications/cancelled)
   16:26:10.299 - Request ID 6 times out (notifications/cancelled) 
   16:31:13.227 - Request ID 7 times out (notifications/cancelled)
   ```
   Roughly 5-minute intervals between timeouts

3. **Server Processing**: Server logs show successful request processing in 0-2ms
   ```
   [2026-01-04T16:26:13.223Z] DEBUG: Request processed successfully
   {
     "duration": "2ms"
   }
   ```

4. **Immediate Success on Retry**: After timeout and retry, the identical request succeeds immediately

### Critical Insight

The server logs "Request processed successfully" **but clients don't receive the response**. This indicates:
- The MCP SDK's request handler completes successfully
- The response is not being properly sent through the HTTP response stream
- The issue is in the transport layer, not the business logic

## Root Cause Analysis

### Hypothesis 1: SSE Response Routing Issue (HIGH CONFIDENCE)

**Problem**: MCP's SSE transport may be routing responses through the SSE event stream (GET connection) rather than the POST response, but the routing fails after idle periods.

**Evidence**:
- Server logs show request processing completes in <2ms
- No errors logged on server side
- Client timeout suggests response never arrives
- SSE pattern uses GET for events, POST for requests
- The MCP SDK's `handlePostMessage` may be sending responses via SSE stream instead of POST response

**Code Location**: [`src/server/sse.ts:151`](src/server/sse.ts:151)
```typescript
await transport.handlePostMessage(req, res);
```

### Hypothesis 2: Express/Node.js HTTP Timeout (MEDIUM CONFIDENCE)

**Problem**: Default HTTP server timeouts may be interfering with response delivery.

**Evidence**:
- SSE connections close every ~120 seconds (Express default timeout)
- Node.js HTTP server default timeout is 120 seconds for incoming requests
- No explicit timeout configuration in code

**Missing Configuration**:
- No `req.setTimeout()` or `res.setTimeout()` calls
- No `server.timeout` configuration
- No keepalive configuration for long-lived connections

**Code Location**: [`src/server/sse.ts:190-197`](src/server/sse.ts:190-197)

### Hypothesis 3: SSE Stream State After Reconnection (MEDIUM CONFIDENCE)

**Problem**: After SSE reconnection, the transport may be in an inconsistent state for the first request.

**Evidence**:
- Pattern shows timeouts occur after connection closes/reopens
- Second request after reconnection always works
- May be a race condition in transport initialization

**Code Location**: [`src/server/sse.ts:63-82`](src/server/sse.ts:63-82)

### Hypothesis 4: Docker Network/Proxy Timeout (LOW-MEDIUM CONFIDENCE)

**Problem**: Intermediate network layer (Docker, nginx, load balancer) timing out connections.

**Evidence**:
- Multiple client IPs visible in logs (192.168.65.1, 192.168.16.3, 192.168.86.250)
- Docker compose environment
- Could be proxy/network timeouts

**Note**: Would need network-level investigation to confirm

## Technical Details

### SSE Transport Flow

1. **Connection Establishment** (GET `/mcp`):
   ```typescript
   const transport = new SSEServerTransport('/mcp', res);
   transports.set(sessionId, transport);
   await server.connect(transport);
   ```

2. **Message Handling** (POST `/mcp`):
   ```typescript
   await transport.handlePostMessage(req, res);
   ```

3. **The MCP SDK Question**: How does `handlePostMessage` send responses?
   - Option A: Through the POST response body (expected for HTTP)
   - Option B: Through the SSE event stream (GET connection)
   - Option C: Hybrid approach

### Current Implementation Gaps

1. **No HTTP Timeout Configuration**:
   ```typescript
   const httpServer = app.listen(port, host, () => {
     // Missing: httpServer.timeout = 0; // disable timeout
     // Missing: httpServer.keepAliveTimeout configuration
   });
   ```

2. **No POST Request Timeout Extension**:
   ```typescript
   app.post('/mcp', async (req, res) => {
     // Missing: req.setTimeout(0); // disable timeout for this request
     // Missing: res.setTimeout(0);
   });
   ```

3. **No SSE Keepalive**:
   - No periodic comment/ping messages on SSE stream
   - May be causing proxies/load balancers to close idle connections

4. **No Response Confirmation Logging**:
   - We log "Request processed successfully" but don't verify response was sent
   - Need to log when response headers are sent

## Proposed Solutions

### Solution 1: HTTP Timeout Configuration (RECOMMENDED - LOW RISK)

**Approach**: Configure HTTP server and request timeouts to prevent premature connection closure.

**Implementation**:
```typescript
// In startSseServer after app.listen()
httpServer.timeout = 0; // Disable timeout for SSE connections
httpServer.keepAliveTimeout = 0; // Disable keepalive timeout
httpServer.headersTimeout = 0; // Disable headers timeout

// In POST /mcp handler
app.post('/mcp', async (req, res) => {
  req.setTimeout(0); // No timeout for this request
  res.setTimeout(0); // No timeout for this response
  // ... rest of handler
});
```

**Pros**:
- Simple configuration change
- Low risk of breaking existing functionality
- Addresses Node.js/Express default timeouts
- Standard practice for SSE/long-polling endpoints

**Cons**:
- Doesn't address potential MCP SDK routing issues
- May not fix issue if problem is in SDK's response handling
- Could mask underlying issues

**Recommendation**: Implement as first step, easy to test and revert

### Solution 2: Enhanced Response Logging & Verification (RECOMMENDED - LOW RISK)

**Approach**: Add detailed logging to understand response flow through the stack.

**Implementation**:
```typescript
app.post('/mcp', async (req, res) => {
  const startTime = Date.now();
  logger.info(`MCP POST message received`);
  
  // Log response state before processing
  logger.trace('Response state before processing', {
    headersSent: res.headersSent,
    finished: res.finished,
    writableEnded: res.writableEnded
  });
  
  try {
    await transport.handlePostMessage(req, res);
    
    // Log response state after processing
    logger.debug('Response state after processing', {
      headersSent: res.headersSent,
      finished: res.finished,
      writableEnded: res.writableEnded,
      statusCode: res.statusCode
    });
    
    const duration = Date.now() - startTime;
    logger.debug(`Request processed successfully`, { duration: `${duration}ms` });
    
    // Verify response was sent
    if (!res.headersSent) {
      logger.error('Response headers were not sent!', { sessionId });
    }
  } catch (error) {
    // ... error handling
  }
});
```

**Pros**:
- Provides visibility into actual problem
- No functional changes, pure observability
- Helps validate other solutions
- Can be kept long-term for debugging

**Cons**:
- Doesn't fix the issue, only helps diagnose
- May add log volume in production

**Recommendation**: Implement alongside Solution 1

### Solution 3: SSE Keepalive Implementation (MEDIUM RISK)

**Approach**: Add periodic keepalive messages on SSE stream to prevent connection closure.

**Implementation**:
```typescript
app.get('/mcp', async (req, res) => {
  logger.info(`New SSE connection from ${req.ip}`);
  
  const transport = new SSEServerTransport('/mcp', res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  
  await server.connect(transport);
  
  // Send keepalive comments every 30 seconds
  const keepaliveInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
      logger.trace('SSE keepalive sent', { sessionId });
    } else {
      clearInterval(keepaliveInterval);
    }
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepaliveInterval);
    logger.info(`SSE connection closed: ${sessionId}`);
    transports.delete(sessionId);
  });
});
```

**Pros**:
- Prevents network intermediaries from closing idle connections
- Standard SSE best practice
- Helps with proxy/load balancer timeouts

**Cons**:
- Adds network traffic overhead
- May not address core response delivery issue
- Could interact unexpectedly with MCP SDK

**Recommendation**: Implement if Solution 1 doesn't fully resolve issue

### Solution 4: Explicit Response Handling (HIGHER RISK)

**Approach**: Investigate MCP SDK's `handlePostMessage` and potentially add explicit response handling.

**Investigation Needed**:
- Review `@modelcontextprotocol/sdk` v0.5.0 source code
- Understand how `SSEServerTransport.handlePostMessage` routes responses
- Determine if responses should go through POST response or SSE stream

**Potential Implementation**:
```typescript
// May need to explicitly handle response after SDK processing
await transport.handlePostMessage(req, res);

// If SDK didn't send response, send one
if (!res.headersSent) {
  logger.warn('SDK did not send response, sending explicit response');
  res.status(200).json({ success: true });
}
```

**Pros**:
- Could address root cause if issue is in SDK usage
- Gives more control over response flow

**Cons**:
- Higher risk of breaking correct SDK behavior
- May duplicate responses if SDK already handles it
- Requires deep SDK knowledge

**Recommendation**: Only pursue if Solutions 1-3 don't resolve issue

### Solution 5: Connection Pooling & State Management (HIGHER RISK)

**Approach**: Enhanced management of transport state and connection lifecycle.

**Implementation**:
```typescript
interface TransportState {
  transport: SSEServerTransport;
  connected: boolean;
  lastActivity: number;
  requestsHandled: number;
}

const transports = new Map<string, TransportState>();

// Add health checks, connection validation, etc.
```

**Pros**:
- Better visibility and control of connection state
- Can detect and recover from inconsistent states
- Enables metrics and monitoring

**Cons**:
- Significant implementation complexity
- May not address underlying issue
- Could introduce new bugs

**Recommendation**: Only if issue proves to be state-related

## Recommended Action Plan

### Phase 1: Low-Risk Diagnostics & Fixes (START HERE)

1. **Implement Solution 2** (Enhanced Logging)
   - Add response state logging
   - Verify response headers are being sent
   - **Effort**: 1-2 hours
   - **Risk**: Minimal

2. **Implement Solution 1** (HTTP Timeout Configuration)
   - Configure server timeouts
   - Configure request/response timeouts
   - **Effort**: 1 hour
   - **Risk**: Low

3. **Test & Observe**
   - Deploy to test environment
   - Monitor for 24-48 hours
   - Analyze new log data
   - **Effort**: 2 days monitoring

### Phase 2: If Issue Persists

4. **Implement Solution 3** (SSE Keepalive)
   - Add keepalive to SSE streams
   - **Effort**: 2-3 hours
   - **Risk**: Low-Medium

5. **SDK Investigation** (Solution 4)
   - Review MCP SDK source code
   - Understand `handlePostMessage` behavior
   - **Effort**: 4-6 hours
   - **Risk**: Depends on findings

### Phase 3: If Still Unresolved

6. **Network Layer Investigation**
   - Docker network analysis
   - Proxy/load balancer configuration
   - TCP packet capture if needed
   - **Effort**: 4-8 hours
   - **Risk**: Depends on findings

## Success Criteria

- [ ] No client timeouts under normal operation
- [ ] First request after idle period succeeds
- [ ] Response times remain under 100ms for simple operations
- [ ] No increase in server errors or warnings
- [ ] Clean log output showing responses being sent

## Related Files

- [`src/server/sse.ts`](src/server/sse.ts) - SSE transport implementation
- [`src/server/mcp-server.ts`](src/server/mcp-server.ts) - MCP server setup
- [`src/tools/tool-handlers.ts`](src/tools/tool-handlers.ts) - Tool request handlers
- [`package.json`](package.json) - MCP SDK version (0.5.0)

## References

- MCP SDK Documentation: https://github.com/modelcontextprotocol/sdk
- SSE Specification: https://html.spec.whatwg.org/multipage/server-sent-events.html
- Node.js HTTP Timeouts: https://nodejs.org/api/http.html#serverkeepalivetimeout
- Express.js Best Practices: https://expressjs.com/en/advanced/best-practice-performance.html
