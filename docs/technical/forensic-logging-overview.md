# Forensic Logging - Project Overview

## Quick Reference

**Problem**: Cannot debug agent (goose) issues with current minimal logging  
**Solution**: Environment-controlled forensic logging with 5 levels  
**Control**: Single variable `TINYTASK_LOG_LEVEL` (default: `info`)  
**Impact**: Zero overhead when disabled, <5ms when enabled  

## Quick Start for Troubleshooting

```bash
# Enable forensic logging
docker-compose down
# Edit docker-compose.yml, set: TINYTASK_LOG_LEVEL: trace
docker-compose up -d

# Watch logs
docker-compose logs -f tinytask

# Reproduce issue with agent

# Analyze full request/response in logs

# Disable when done
docker-compose down
# Edit docker-compose.yml, set: TINYTASK_LOG_LEVEL: info
docker-compose up -d
```

## Log Levels

| Level | When to Use | What You See |
|-------|------------|--------------|
| `error` | Production (quiet) | Only errors |
| `warn` | Production (stable) | Warnings + errors |
| `info` | Production (default) | Operation summaries |
| `debug` | Development | Tool calls, validation |
| `trace` | Troubleshooting | **Full request/response bodies** |

## What Changes

### Before (Current)
```
tinytask-mcp | MCP POST message received
```

### After (TRACE level)
```
[2025-12-27T18:45:00.123Z] INFO: MCP POST message received
[2025-12-27T18:45:00.124Z] TRACE: Request body
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_task",
    "arguments": {
      "title": "Test Task",
      "assigned_to": "goose"
    }
  }
}
[2025-12-27T18:45:00.125Z] DEBUG: Tool call: create_task
[2025-12-27T18:45:00.134Z] INFO: Task created: 42
[2025-12-27T18:45:00.135Z] TRACE: HTTP Response
{
  "status": 200,
  "result": { ... }
}
```

## Architecture

```
Environment Variable (TINYTASK_LOG_LEVEL)
    ↓
Logger Utility (level filtering)
    ↓
┌───────────┬──────────────┬──────────────┐
│  HTTP     │  Tool        │  Service     │
│  Layer    │  Handler     │  Layer       │
│           │  Layer       │              │
│ Request/  │ Tool calls/  │ Database     │
│ Response  │ Validation/  │ operations   │
│ Duration  │ Results      │              │
└───────────┴──────────────┴──────────────┘
    ↓
stderr output → Docker logs → docker-compose logs
```

## Key Files

### Documentation
- **[Story](../product-stories/forensic-logging/story-01-forensic-logging.md)**: Product requirements and acceptance criteria
- **[Architecture](forensic-logging-architecture.md)**: Technical design and flow diagrams
- **[Implementation](forensic-logging-implementation.md)**: Detailed code changes and migration plan

### Implementation Files
- `src/utils/logger.ts` (NEW) - Core logger utility
- `src/server/sse.ts` (MODIFY) - HTTP request/response logging
- `src/tools/tool-handlers.ts` (MODIFY) - Tool execution logging
- `docker-compose.yml` (MODIFY) - Add TINYTASK_LOG_LEVEL config

## Implementation Phases

### Phase 1: Core Logger (Priority 1)
Create the logger utility with level-based filtering
- Files: `src/utils/logger.ts`, `src/utils/index.ts`
- Outcome: Foundation for all logging

### Phase 2: HTTP Layer (Priority 1) 
Add request/response capture to SSE server
- Files: `src/server/sse.ts`
- Outcome: **Solves the goose debugging problem**

### Phase 3: Tool Layer (Priority 2)
Add detailed tool execution logging
- Files: `src/tools/tool-handlers.ts`, `src/tools/*-tools.ts`
- Outcome: See tool validation and execution flow

### Phase 4: Documentation (Priority 1)
Update user-facing documentation
- Files: `README.md`, troubleshooting guides
- Outcome: Users know how to use the feature

## Benefits

### For Debugging
- See exactly what agents send
- See exactly what server responds
- See where validation fails
- See duration of operations

### For Development
- Understand agent integration issues
- Validate request/response formats
- Optimize slow operations
- Track down edge cases

### For Operations
- Troubleshoot production issues
- Analyze performance bottlenecks
- Audit agent behavior
- Monitor system health

## Performance

| Scenario | Impact |
|----------|--------|
| Default (INFO) | 0ms overhead - same as current |
| DEBUG mode | ~1-2ms per request |
| TRACE mode | ~3-5ms per request |

**Design**: Lazy evaluation ensures zero cost when disabled

## Testing Strategy

1. **Unit Tests**: Logger level filtering and formatting
2. **Integration Tests**: Verify logging doesn't break functionality
3. **Manual Tests**: Debug actual goose agent issues
4. **Performance Tests**: Verify overhead within targets

## Configuration Examples

### Development (Local)
```bash
export TINYTASK_LOG_LEVEL=debug
npm run dev
```

### Docker (Troubleshooting)
```yaml
environment:
  TINYTASK_LOG_LEVEL: trace
```

### Docker (Production)
```yaml
environment:
  TINYTASK_LOG_LEVEL: warn
```

### MCP Client (stdio)
```json
{
  "mcpServers": {
    "tinytask": {
      "command": "node",
      "args": ["./build/index.js"],
      "env": {
        "TINYTASK_LOG_LEVEL": "debug"
      }
    }
  }
}
```

## Security Notes

- No automatic sensitive data filtering in v1
- All request/response data logged as-is
- Use TRACE only for troubleshooting
- Suitable for private/internal deployments
- Future: Add configurable field filtering

## Next Steps

1. **Review** this plan and the detailed documentation
2. **Approve** the approach or request changes
3. **Switch to Code mode** to implement the solution
4. **Test** with the goose agent that's having issues

## Questions to Consider

Before implementation, consider:

1. **Scope**: Is Phase 1-2 sufficient, or do you want all phases?
   - Phase 1-2 solves the immediate goose debugging problem
   - Phase 3 adds nice-to-have tool-level details
   - Phase 4 is documentation (always needed)

2. **Default Level**: Keep default as `info` for backward compatibility?
   - Recommendation: Yes, keep `info` as default

3. **Performance**: Is <5ms overhead acceptable for TRACE mode?
   - Recommendation: Yes, TRACE is only for troubleshooting

4. **Security**: Any sensitive fields to avoid logging?
   - Current scope: Log everything (suitable for private deployments)
   - Future: Add filtering if needed

## Related Documents

- **Product Story**: [`docs/product-stories/forensic-logging/story-01-forensic-logging.md`](../product-stories/forensic-logging/story-01-forensic-logging.md)
- **Architecture**: [`docs/technical/forensic-logging-architecture.md`](forensic-logging-architecture.md)
- **Implementation Plan**: [`docs/technical/forensic-logging-implementation.md`](forensic-logging-implementation.md)
- **Agents.md**: [`agents.md`](../../agents.md) - Development rules and standards
