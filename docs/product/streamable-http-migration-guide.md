# Streamable HTTP Migration Guide

## Overview

TinyTask MCP now uses Streamable HTTP as the default HTTP transport. The change replaces SSE's dual-endpoint model with a unified `/mcp` endpoint that supports bidirectional messaging and optional streaming per request. This guide explains why the change was made, how to stay compatible, and what steps to take when migrating existing deployments.

### Why Streamable HTTP?

- **Simpler client configuration**: Single endpoint covers both requests and streaming responses.
- **Better scalability**: Fewer long-lived connections compared to SSE's dual channel (GET + POST).
- **Improved session management**: Built-in session resumption using standard headers.
- **Performance gains**: Lower connection overhead and reduced network chatter.

### Backward Compatibility

- SSE remains available as a legacy transport when `TINYTASK_ENABLE_SSE=true`.
- All existing SSE clients can continue functioning without code changes when the flag is enabled.
- No server APIs were removed; only the default transport selection changed.

## For Current SSE Users

### Option 1: Do Nothing (Temporary Compatibility)

- If your deployment sets `TINYTASK_MODE=http` but does not specify `TINYTASK_ENABLE_SSE`, Streamable HTTP will start automatically.
- However, `TINYTASK_START:sse` scripts now emit a deprecation warning. Plan a migration before SSE removal.

### Option 2: Explicit SSE Mode

```bash
TINYTASK_MODE=http \
TINYTASK_ENABLE_SSE=true \
node build/index.js
```

- Use if you must keep SSE clients running during migration.
- Monitor logs: SSE mode logs a ⚠️ legacy warning to remind maintainers to migrate.

### Option 3: Migrate to Streamable HTTP

1. Remove `TINYTASK_ENABLE_SSE` or set it to `false`.
2. Verify clients target the same `/mcp` endpoint (no change needed for most HTTP clients).
3. Update documentation references from SSE to Streamable HTTP.
4. Roll out gradually and monitor logs for transport mismatches.

## For New Users

- Default `TINYTASK_MODE=http` automatically enables Streamable HTTP.
- Docker quick start: `docker-compose up -d` (the compose file now uses Streamable HTTP).
- NPM scripts: `npm run start:http` or `npm run start:both` for stdio + HTTP.

### Docker Example

```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e TINYTASK_MODE=http \
  tinytask-mcp:latest
```

## Technical Differences

| Aspect | Streamable HTTP | SSE |
| --- | --- | --- |
| Endpoints | Single `/mcp` (handles GET/POST) | GET `/mcp` for events, POST `/mcp` for commands |
| Session | `Mcp-Session-Id` header managed by server | Per-connection session ID on transport |
| Connection Model | Request/response with optional streaming | Long-lived event stream + POST |
| Performance | Fewer sockets, lower latency | More connections, higher idle overhead |

### Session Management

- Streamable HTTP uses a session ID header so clients can resume without renegotiating entire state.
- SSE relies on persistent streams; reconnect logic is more complex.

### Connection Model

- Streamable HTTP accepts POST and streaming responses over the same endpoint.
- SSE requires separate GET streams and POST requests.

## Troubleshooting

### Verify Transport

```bash
curl http://localhost:3000/health
# { "status": "healthy", "transport": "streamable-http" }
```

If you see `"transport": "sse"`, the legacy flag is enabled or cached.

### Common Migration Issues

| Symptom | Cause | Resolution |
| --- | --- | --- |
| Client sees timeouts | Client still expects SSE's dual endpoints | Update client to Streamable HTTP or enable legacy mode temporarily |
| Health endpoint reports SSE unexpectedly | `TINYTASK_ENABLE_SSE` set somewhere | Remove the flag or set to `false` |
| Performance drop after migration | Client still opens multiple connections | Ensure client reuses session IDs and respects new model |

### When to Use SSE vs Streamable HTTP

- **Use Streamable HTTP**: New deployments, clients that can handle single-endpoint communication, scenarios requiring better scaling.
- **Use SSE**: Only when client libraries cannot yet adopt Streamable HTTP. Plan to migrate once client support is available.

## FAQ

**Is SSE being removed?**
Not immediately, but it is deprecated. Expect removal in a future major release.

**Do I need to change my client code?**
Stdio clients require no change. HTTP clients should treat `/mcp` as a unified endpoint. If your client assumed dual endpoints, update it or keep SSE enabled temporarily.

**What is the performance difference?**
Streamable HTTP reduces persistent sockets and shortens response turnaround times, especially under burst loads. Early benchmarks show 10-20% improvement in connection efficiency.

**Can I switch back to SSE?**
Yes. Set `TINYTASK_ENABLE_SSE=true` and restart the server. Remember to remove the flag after clients migrate.
