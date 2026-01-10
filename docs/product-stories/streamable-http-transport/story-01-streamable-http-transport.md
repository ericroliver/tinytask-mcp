# Story: Streamable HTTP Transport Implementation

## Overview
Implement Streamable HTTP as the new default HTTP transport for TinyTask MCP, replacing SSE while maintaining backward compatibility through runtime configuration.

## Epic Link
Technical Design: [`docs/technical/streamable-http-transport-design.md`](../../technical/streamable-http-transport-design.md)

## Goals
- Implement Streamable HTTP transport using MCP SDK
- Create configuration-based transport selection
- Maintain full backward compatibility with existing SSE deployments
- Improve scalability and reduce connection overhead
- Simplify client connection logic

## User Stories

### Story 1.1: Create Streamable HTTP Transport Module
**As a** developer  
**I want** a new Streamable HTTP transport implementation  
**So that** the system can use the more efficient unified endpoint approach

**Acceptance Criteria:**
- [ ] Create `src/server/streamable-http.ts` module
- [ ] Implement `startStreamableHttpServer()` function with same signature as `startSseServer()`
- [ ] Import `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`
- [ ] Set up Express.js HTTP server with:
  - Single unified `/mcp` endpoint (handles both POST and GET)
  - `/health` endpoint returning `{ status: 'healthy', transport: 'streamable-http' }`
  - CORS middleware
- [ ] Implement session management:
  - Use `Mcp-Session-Id` header for session tracking
  - Store sessions in `Map<string, { transport, server }>`
  - Create new MCP Server instance per session
  - Clean up sessions on disconnect
- [ ] Handle both POST and GET on `/mcp`:
  - POST: Handle incoming MCP protocol messages
  - GET: Establish streaming connection if needed
- [ ] Add comprehensive logging similar to SSE implementation
- [ ] Implement graceful shutdown handler

**Technical Notes:**
```typescript
// Key imports
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Session management
const sessions = new Map<string, { 
  transport: StreamableHTTPServerTransport; 
  server: Server 
}>();

// Unified endpoint handler
app.use('/mcp', async (req, res) => {
  let sessionId = req.headers['mcp-session-id'] as string;
  // Create or retrieve session
  // Handle request through transport
});
```

**Testing Requirements:**
- Unit tests for session creation and management
- Unit tests for request/response handling
- Unit tests for session cleanup
- Integration test for complete MCP tool execution flow

---

### Story 1.2: Create HTTP Transport Router
**As a** system administrator  
**I want** the system to automatically select the correct HTTP transport based on configuration  
**So that** I can control which transport is used without code changes

**Acceptance Criteria:**
- [ ] Create `src/server/http.ts` module
- [ ] Implement `startHttpServer()` function that:
  - Checks `TINYTASK_ENABLE_SSE` environment variable
  - Routes to `startSseServer()` if `TINYTASK_ENABLE_SSE=true`
  - Routes to `startStreamableHttpServer()` if `TINYTASK_ENABLE_SSE=false` or unset
  - Logs which transport is being used
- [ ] Define `HttpServerOptions` interface (alias for `SseServerOptions`)
- [ ] Export all necessary types

**Implementation:**
```typescript
export interface HttpServerOptions {
  port?: number;
  host?: string;
}

export async function startHttpServer(
  taskService: TaskService,
  commentService: CommentService,
  linkService: LinkService,
  options?: HttpServerOptions
): Promise<void> {
  const enableSse = process.env.TINYTASK_ENABLE_SSE === 'true';
  
  if (enableSse) {
    logger.info('🔄 Using SSE transport (legacy mode)');
    return startSseServer(taskService, commentService, linkService, options);
  } else {
    logger.info('✨ Using Streamable HTTP transport');
    return startStreamableHttpServer(taskService, commentService, linkService, options);
  }
}
```

**Testing Requirements:**
- Unit test: `TINYTASK_ENABLE_SSE=true` calls `startSseServer()`
- Unit test: `TINYTASK_ENABLE_SSE=false` calls `startStreamableHttpServer()`
- Unit test: Unset `TINYTASK_ENABLE_SSE` calls `startStreamableHttpServer()`

---

### Story 1.3: Update Entry Point for Transport Selection
**As a** developer  
**I want** the entry point to use the new HTTP router  
**So that** transport selection is centralized and consistent

**Acceptance Criteria:**
- [ ] Update `src/index.ts` to import `startHttpServer` instead of `startSseServer`
- [ ] Implement mode normalization logic:
  - Map legacy `'sse'` → `'http'` with internal `TINYTASK_ENABLE_SSE=true`
  - Log deprecation warning when `'sse'` is used
- [ ] Update mode validation:
  - Accept: `['stdio', 'http', 'both', 'sse']`
  - Map `'sse'` internally to `'http'` mode
- [ ] Replace SSE-specific startup logic with HTTP router calls
- [ ] Update startup banner to show actual transport in use
- [ ] Maintain stdio mode startup logic (no changes)

**Implementation Details:**
```typescript
// Mode normalization
let mode = process.env.TINYTASK_MODE || 'both';
if (mode === 'sse') {
  logger.warn('⚠️  TINYTASK_MODE=sse is deprecated. Use TINYTASK_MODE=http with TINYTASK_ENABLE_SSE=true');
  mode = 'http';
  if (!process.env.TINYTASK_ENABLE_SSE) {
    process.env.TINYTASK_ENABLE_SSE = 'true';
  }
}

// Validation
if (!['stdio', 'http', 'both'].includes(mode)) {
  throw new Error(`Invalid mode: ${mode}. Must be stdio, http, or both`);
}

// Transport startup
if (mode === 'http' || mode === 'both') {
  console.error('Starting HTTP transport...');
  await startHttpServer(taskService, commentService, linkService, { port, host });
  console.error('✓ HTTP transport started');
}
```

**Testing Requirements:**
- Integration test: `TINYTASK_MODE=http` starts Streamable HTTP
- Integration test: `TINYTASK_MODE=http TINYTASK_ENABLE_SSE=true` starts SSE
- Integration test: `TINYTASK_MODE=sse` starts SSE with deprecation warning
- Integration test: `TINYTASK_MODE=both` starts stdio + Streamable HTTP
- Integration test: `TINYTASK_MODE=stdio` starts only stdio

---

### Story 1.4: Update Package Scripts
**As a** developer  
**I want** convenient npm scripts for different transport modes  
**So that** I can easily test and run different configurations

**Acceptance Criteria:**
- [ ] Update `package.json` scripts section
- [ ] Add `start:http` for Streamable HTTP mode
- [ ] Add `start:http:sse` for legacy SSE mode
- [ ] Update `start:both` scripts
- [ ] Mark `start:sse` as deprecated with echo warning
- [ ] Update documentation strings in scripts

**New Scripts:**
```json
{
  "scripts": {
    "start": "node build/index.js",
    "start:stdio": "TINYTASK_MODE=stdio node build/index.js",
    "start:http": "TINYTASK_MODE=http node build/index.js",
    "start:http:sse": "TINYTASK_MODE=http TINYTASK_ENABLE_SSE=true node build/index.js",
    "start:both": "TINYTASK_MODE=both node build/index.js",
    "start:both:sse": "TINYTASK_MODE=both TINYTASK_ENABLE_SSE=true node build/index.js",
    "start:sse": "echo '⚠️  DEPRECATED: Use start:http:sse instead' && TINYTASK_MODE=http TINYTASK_ENABLE_SSE=true node build/index.js"
  }
}
```

**Testing Requirements:**
- Manual verification: Each script runs successfully
- Documentation: README updated with new script names

---

### Story 1.5: Add Streamable HTTP Integration Tests
**As a** QA engineer  
**I want** comprehensive tests for Streamable HTTP transport  
**So that** I can verify it works correctly and maintains compatibility

**Acceptance Criteria:**
- [ ] Create `tests/integration/streamable-http.test.ts`
- [ ] Test suite: Server initialization
  - Server starts successfully with Streamable HTTP
  - Health endpoint returns correct transport type
  - Server binds to correct port and host
- [ ] Test suite: Session management
  - New session created on first request
  - Session ID returned in response header
  - Same session reused on subsequent requests with same ID
  - Multiple concurrent sessions work independently
- [ ] Test suite: MCP tool execution
  - `create_task` via Streamable HTTP
  - `get_task` via Streamable HTTP
  - `update_task` via Streamable HTTP
  - `list_tasks` via Streamable HTTP
  - All other existing tools work
- [ ] Test suite: MCP resource access
  - `task://{id}` resource via Streamable HTTP
  - `queue://{agent_name}` resource via Streamable HTTP
  - All other existing resources work
- [ ] Test suite: Error handling
  - Invalid session ID returns appropriate error
  - Malformed requests handled gracefully
  - Server errors logged and returned properly

**Testing Requirements:**
- All tests must pass with `npm test`
- Coverage should match or exceed existing SSE tests

---

### Story 1.6: Add Transport Configuration Tests
**As a** QA engineer  
**I want** tests that verify configuration-based transport selection  
**So that** I can ensure backward compatibility and correct behavior

**Acceptance Criteria:**
- [ ] Create `tests/integration/transport-configuration.test.ts`
- [ ] Test: `TINYTASK_ENABLE_SSE=true` activates SSE transport
- [ ] Test: `TINYTASK_ENABLE_SSE=false` activates Streamable HTTP transport
- [ ] Test: Unset `TINYTASK_ENABLE_SSE` defaults to Streamable HTTP
- [ ] Test: `TINYTASK_MODE=sse` activates SSE with deprecation warning
- [ ] Test: `TINYTASK_MODE=http` without flag uses Streamable HTTP
- [ ] Test: `TINYTASK_MODE=both` uses Streamable HTTP by default
- [ ] Test: `TINYTASK_MODE=both TINYTASK_ENABLE_SSE=true` uses SSE

**Implementation Notes:**
```typescript
describe('Transport Configuration', () => {
  it('should use SSE when TINYTASK_ENABLE_SSE=true', async () => {
    process.env.TINYTASK_MODE = 'http';
    process.env.TINYTASK_ENABLE_SSE = 'true';
    // Start server
    // Verify SSE transport characteristics
  });

  it('should use Streamable HTTP by default', async () => {
    process.env.TINYTASK_MODE = 'http';
    delete process.env.TINYTASK_ENABLE_SSE;
    // Start server
    // Verify Streamable HTTP transport characteristics
  });

  // ... more tests
});
```

**Testing Requirements:**
- Tests must not interfere with each other (proper cleanup)
- Use different ports for each test
- Verify actual transport behavior, not just configuration

---

### Story 1.7: Update Documentation
**As a** user  
**I want** updated documentation explaining the new transport options  
**So that** I can understand how to configure and migrate my deployment

**Acceptance Criteria:**
- [ ] Update `README.md`:
  - Add Streamable HTTP as default transport
  - Document `TINYTASK_ENABLE_SSE` environment variable
  - Update configuration examples
  - Add migration guide section
- [ ] Update `docs/technical/architecture.md`:
  - Update transport architecture diagrams
  - Add Streamable HTTP description
  - Update configuration matrix
  - Update deployment examples
- [ ] Update `docs/deployment.md`:
  - Update Docker examples
  - Update docker-compose.yml examples
  - Add transport selection examples
- [ ] Update `agents.md`:
  - Update environment variables section
  - Add `TINYTASK_ENABLE_SSE` to variables list
  - Update configuration examples
- [ ] Create `docs/product/streamable-http-migration-guide.md`:
  - Why the change?
  - What's different?
  - Migration steps
  - Backward compatibility guarantees
  - FAQ section

**Migration Guide Outline:**
```markdown
# Streamable HTTP Migration Guide

## Overview
TinyTask MCP now uses Streamable HTTP as the default HTTP transport...

## For Current SSE Users
### Option 1: No Changes (Backward Compatible)
### Option 2: Explicit SSE Mode
### Option 3: Migrate to Streamable HTTP

## For New Users
### Default Configuration
### Docker Deployment

## Troubleshooting
### Common Issues
### How to verify transport in use
### Performance comparison

## FAQ
```

**Testing Requirements:**
- Documentation review by peer
- All code examples tested and verified
- Links in documentation are valid

---

### Story 1.8: Update Docker Configuration
**As a** DevOps engineer  
**I want** updated Docker configurations reflecting the new transport options  
**So that** I can deploy with the correct transport configuration

**Acceptance Criteria:**
- [ ] Update `Dockerfile`:
  - Add comments about transport configuration
  - Set default `TINYTASK_MODE=http`
  - Remove any SSE-specific configuration
- [ ] Update `docker-compose.yml`:
  - Add example using Streamable HTTP (default)
  - Add commented example using SSE legacy mode
  - Update environment variable documentation
- [ ] Update `docker-compose.dev.yml`:
  - Use Streamable HTTP by default
  - Add SSE variant as separate service
- [ ] Create new example: `docker-compose.legacy-sse.yml`:
  - Shows how to run with SSE explicitly
  - Documents migration path

**Example docker-compose.yml:**
```yaml
version: '3.8'
services:
  tinytask:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      TINYTASK_MODE: http  # Default: Streamable HTTP
      # TINYTASK_ENABLE_SSE: 'true'  # Uncomment for legacy SSE mode
      TINYTASK_PORT: 3000
      TINYTASK_DB_PATH: /data/tinytask.db
```

**Testing Requirements:**
- Docker build succeeds
- Docker run with default config uses Streamable HTTP
- Docker run with SSE flag uses SSE
- Health endpoint confirms transport type

---

### Story 1.9: Performance Testing and Comparison
**As a** performance engineer  
**I want** comparative performance metrics between SSE and Streamable HTTP  
**So that** I can validate the improvement claims

**Acceptance Criteria:**
- [ ] Create `tests/performance/transport-comparison.test.ts`
- [ ] Metrics to measure:
  - Requests per second
  - Concurrent connection handling
  - Memory usage
  - Response latency (p50, p95, p99)
  - Connection setup time
- [ ] Test scenarios:
  - Single client, sequential requests
  - Single client, burst requests
  - Multiple clients, concurrent requests
  - Long-running session
- [ ] Generate performance report comparing:
  - SSE transport results
  - Streamable HTTP transport results
  - Percentage improvement
- [ ] Document results in `docs/technical/streamable-http-performance.md`

**Performance Test Structure:**
```typescript
describe('Transport Performance Comparison', () => {
  describe('SSE Transport', () => {
    it('measures throughput under load', async () => {
      // Configure for SSE
      // Run load test
      // Collect metrics
    });
  });

  describe('Streamable HTTP Transport', () => {
    it('measures throughput under load', async () => {
      // Configure for Streamable HTTP
      // Run load test
      // Collect metrics
    });
  });

  describe('Comparison', () => {
    it('generates performance report', () => {
      // Compare metrics
      // Generate report
    });
  });
});
```

**Testing Requirements:**
- Tests run in isolated environment
- Consistent test conditions for both transports
- Results are reproducible
- Performance baseline is reasonable

---

### Story 1.10: Backward Compatibility Verification
**As a** release manager  
**I want** comprehensive verification that existing deployments won't break  
**So that** I can confidently release this feature

**Acceptance Criteria:**
- [ ] Create `tests/integration/backward-compatibility.test.ts`
- [ ] Test: Existing stdio configuration unchanged
- [ ] Test: Existing `TINYTASK_MODE=sse` still works
- [ ] Test: Existing `TINYTASK_MODE=both` still works
- [ ] Test: All existing tools work with SSE transport
- [ ] Test: All existing resources work with SSE transport
- [ ] Test: Database operations identical across transports
- [ ] Test: Deprecation warnings logged appropriately
- [ ] Verification checklist:
  - [ ] No breaking changes to API
  - [ ] No changes to database schema
  - [ ] No changes to MCP protocol messages
  - [ ] Existing client configurations work
  - [ ] Existing Docker deployments work

**Testing Requirements:**
- All existing integration tests pass
- No test modifications required for existing tests
- SSE mode still achieves same test coverage

---

## Dependencies
- MCP SDK version `^0.5.0` (current) supports Streamable HTTP
- No new external dependencies required
- All existing dependencies remain unchanged

## Technical Debt
- SSE transport module will be marked as legacy but maintained
- Consider removal of SSE in future major version (6+ months)
- Add deprecation timeline to documentation

## Rollback Plan
If issues are discovered after deployment:
1. Advise users to set `TINYTASK_ENABLE_SSE=true`
2. All functionality falls back to SSE transport
3. No code rollback required due to backward compatibility
4. Address issues in Streamable HTTP implementation
5. Remove `TINYTASK_ENABLE_SSE` flag after fix

## Definition of Done
- [ ] All stories completed and accepted
- [ ] All tests pass (unit, integration, performance)
- [ ] Code review completed
- [ ] Documentation updated and reviewed
- [ ] Performance metrics documented
- [ ] Backward compatibility verified
- [ ] Docker images built and tested
- [ ] Migration guide published
- [ ] Release notes drafted

## Estimated Effort
- Story 1.1: 2 days (Streamable HTTP module)
- Story 1.2: 1 day (HTTP router)
- Story 1.3: 1 day (Entry point updates)
- Story 1.4: 0.5 days (Package scripts)
- Story 1.5: 2 days (Integration tests)
- Story 1.6: 1 day (Configuration tests)
- Story 1.7: 2 days (Documentation)
- Story 1.8: 1 day (Docker updates)
- Story 1.9: 1.5 days (Performance testing)
- Story 1.10: 1 day (Backward compatibility)

**Total: ~13 days (2.5 weeks)**

## Success Metrics
- Zero breaking changes in existing deployments
- 10-20% improvement in connection efficiency
- All tests pass with >90% coverage
- Positive user feedback on migration process
- No increase in support requests after release
