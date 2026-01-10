# Streamable HTTP Transport Fix

## Issue Summary

**Error**: `HTTP status client error (400 Bad Request)` when MCP clients attempt to connect to TinyTask via Streamable HTTP transport.

**Root Cause**: The `StreamableHTTPServerTransport.handleRequest()` method was attempting to parse the request body internally, but Express's `express.json()` middleware had already consumed and parsed the body stream. This caused a "Parse error: Invalid JSON" when the SDK tried to read from an already-consumed stream.

## Technical Details

### The Problem

In `src/server/streamable-http.ts`, the code was:

```typescript
// Line 37: Express JSON middleware pre-parses the body
app.use(express.json());

// ...

// Line 109: Transport tries to parse body again from consumed stream
await transport.handleRequest(req, res);
```

The MCP SDK's `StreamableHTTPServerTransport` has this signature:

```typescript
handleRequest(
  req: IncomingMessage & { auth?: AuthInfo },
  res: ServerResponse,
  parsedBody?: unknown  // <-- Optional pre-parsed body parameter
): Promise<void>;
```

When we didn't pass the `parsedBody` parameter, the transport tried to read and parse `req` as a stream, which had already been consumed by Express middleware.

### The Solution

Pass the pre-parsed body from Express to the transport:

```typescript
// Pass the pre-parsed body from Express middleware to avoid double-parsing
await transport.handleRequest(req, res, req.body);
```

## Testing

### Before Fix
```bash
$ curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}'

HTTP/1.1 400 Bad Request
{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error: Invalid JSON"},"id":null}
```

### After Fix
The server should now correctly handle MCP requests without parse errors.

## Verification

- ✅ Build succeeds: `npm run build`
- ✅ All 149 tests pass: `npm test`
- ✅ Linting passes: `npm run lint`
- ✅ No TypeScript compilation errors

## Files Modified

- `src/server/streamable-http.ts` (line 109): Added `req.body` parameter to `handleRequest()` call

## Impact

This fix enables MCP clients to successfully connect to TinyTask using the Streamable HTTP transport. Without this fix, all Streamable HTTP connections would fail with 400 Bad Request errors.

## Related Documentation

- MCP SDK Documentation: `@modelcontextprotocol/sdk`
- TypeScript definition: `node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.d.ts`
- README section: [MCP Client Configuration](README.md#mcp-client-configuration)

## Date

2026-01-10
