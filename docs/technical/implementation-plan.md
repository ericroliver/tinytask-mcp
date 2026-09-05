# TinyTask MCP Implementation Plan

## Project Overview

**Project Name:** TinyTask MCP  
**Version:** 1.0.0 (MVP)  
**Purpose:** Minimal task management system for LLM agent collaboration  
**Technology:** Node.js/TypeScript MCP Server with SQLite  
**Deployment:** Docker container with persistent storage

## Goals and Non-Goals

### Goals
✅ Enable multiple LLM agents to collaborate on tasks  
✅ Support task queuing and assignment between agents  
✅ Allow agents to add comments and links to tasks  
✅ Provide both stdio (local) and SSE (remote) transport  
✅ Ensure data persistence across container restarts  
✅ Minimal viable product - simple and focused

### Non-Goals
❌ User authentication/authorization (trusted network)  
❌ Complex workflow engine (agents decide routing)  
❌ Web UI (CLI/MCP-only interface)  
❌ Real-time notifications (agents poll)  
❌ Advanced reporting/analytics  
❌ Multi-database support (SQLite only for MVP)

## Technical Specifications

### Technology Stack

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| Runtime | Node.js | 20+ | LTS, excellent async support |
| Language | TypeScript | 5+ | Type safety, better IDE support |
| Framework | @modelcontextprotocol/sdk | Latest | Official MCP SDK |
| Database | SQLite3 | 3+ | Embedded, zero-config, sufficient for MVP |
| DB Driver | better-sqlite3 | Latest | Synchronous API, excellent performance |
| HTTP Server | Express.js | 4+ | For SSE mode |
| Container | Docker | - | Portability and isolation |
| Base Image | node:20-alpine | - | Small size, security updates |

### Database Schema Summary

**4 Tables:**
1. **tasks** - Core entity with status, assignment, priority
2. **comments** - Many-to-one with tasks
3. **links** - Many-to-one with tasks  
4. **task_history** - Audit trail (populated on every task mutation since v2.2.0)

**Key Features:**
- Foreign key constraints with CASCADE delete
- Indexes on query paths (assigned_to, status)
- Soft delete via archived_at timestamp
- WAL mode for better concurrency

See: [`database-schema.md`](database-schema.md)

### MCP API Summary

**Tools (20 total):**
- Task CRUD: create_task, update_task, get_task, delete_task, archive_task, list_tasks, get_my_queue
- Comment CRUD: add_comment, update_comment, delete_comment, list_comments
- Link CRUD: add_link, update_link, delete_link, list_links

**Resources (7 total):**
- `task://{id}` - Single task with comments/links
- `task://{id}/comments` - Task comments
- `task://{id}/links` - Task links
- `queue://{agent_name}` - Agent's queue
- `queue://{agent_name}/summary` - Queue summary
- `tasks://active` - All active tasks
- `tasks://archived` - All archived tasks

See: [`mcp-api-design.md`](mcp-api-design.md)

### Architecture Summary

**Components:**
- MCP Server Core (transport-agnostic)
- Stdio Transport (local development)
- SSE Transport (production multi-agent)
- Service Layer (business logic)
- Data Access Layer (SQLite)

**Data Flow:**
Agent → MCP Protocol → Tools/Resources → Service → Database → Response

See: [`architecture.md`](architecture.md)

## Implementation Phases

### Phase 1: Project Setup (Story 1)
**Goal:** Bootstrap project structure with TypeScript and MCP SDK

**Tasks:**
1. Initialize npm project
2. Configure TypeScript (tsconfig.json)
3. Install dependencies (@modelcontextprotocol/sdk, better-sqlite3, etc.)
4. Set up build system
5. Create directory structure
6. Configure ESLint/Prettier
7. Initialize git repository

**Deliverables:**
- Working TypeScript build pipeline
- Project structure in place
- Dependencies installed
- README with setup instructions

**Estimated Effort:** 2-4 hours

---

### Phase 2: Database Layer (Story 2)
**Goal:** Implement SQLite database with schema and client

**Tasks:**
1. Create schema.sql with all table definitions
2. Implement database client wrapper
3. Add database initialization logic (create tables if not exist)
4. Configure WAL mode and pragmas
5. Write database connection management
6. Add error handling for database operations
7. Create simple test script to verify database

**Deliverables:**
- Working SQLite database
- Schema automatically created on first run
- Database client module
- Connection management

**Estimated Effort:** 4-6 hours

---

### Phase 3: Service Layer (Story 3)
**Goal:** Implement business logic for tasks, comments, and links

**Tasks:**
1. Create TaskService with CRUD operations
2. Create CommentService with CRUD operations
3. Create LinkService with CRUD operations
4. Implement queue query logic
5. Implement list/filter logic
6. Add validation logic
7. Add timestamp management (created_at, updated_at)
8. Write unit tests for services

**Deliverables:**
- TaskService module
- CommentService module
- LinkService module
- Test coverage for core logic

**Estimated Effort:** 8-12 hours

---

### Phase 4: MCP Tools Implementation (Story 4)
**Goal:** Implement all MCP tools using service layer

**Tasks:**
1. Implement task tools (7 tools)
2. Implement comment tools (4 tools)
3. Implement link tools (4 tools)
4. Add parameter validation with zod schemas
5. Add error handling and formatting
6. Test each tool individually

**Deliverables:**
- 15+ working MCP tools
- Zod validation schemas
- Error handling

**Estimated Effort:** 8-12 hours

---

### Phase 5: MCP Resources Implementation (Story 5)
**Goal:** Implement all MCP resources for data access

**Tasks:**
1. Implement task resources (task://{id}, etc.)
2. Implement queue resources (queue://{agent_name}, etc.)
3. Implement list resources (tasks://active, tasks://archived)
4. Add URI parsing and validation
5. Test each resource

**Deliverables:**
- 7+ working MCP resources
- URI template handling
- Resource listing support

**Estimated Effort:** 4-6 hours

---

### Phase 6: Stdio Transport (Story 6)
**Goal:** Implement stdio transport for local development

**Tasks:**
1. Create stdio transport module
2. Integrate with MCP server
3. Add logging to stderr (stdout reserved for MCP protocol)
4. Test with local MCP client
5. Document stdio configuration

**Deliverables:**
- Working stdio mode
- Local testing capability
- Configuration documentation

**Estimated Effort:** 2-4 hours

---

### Phase 7: SSE Transport (Story 7)
**Goal:** Implement HTTP SSE transport for remote agents

**Tasks:**
1. Create Express.js server
2. Implement SSE endpoint
3. Integrate with MCP server
4. Add health check endpoint
5. Add CORS configuration if needed
6. Test with remote MCP client
7. Document SSE configuration

**Deliverables:**
- Working SSE mode
- Health check endpoint
- Remote connectivity
- Configuration documentation

**Estimated Effort:** 4-6 hours

---

### Phase 8: Server Entry Point (Story 8)
**Goal:** Create unified entry point supporting both transports

**Tasks:**
1. Create index.ts with mode detection
2. Support TINYTASK_MODE environment variable
3. Initialize database on startup
4. Add graceful shutdown handling
5. Add startup logging
6. Test both modes

**Deliverables:**
- Unified server entry point
- Mode selection via environment variable
- Proper initialization and shutdown

**Estimated Effort:** 2-4 hours

---

### Phase 9: Docker Packaging (Story 9)
**Goal:** Package application as Docker container

**Tasks:**
1. Create multi-stage Dockerfile
2. Create docker-compose.yml
3. Configure volume mounts for persistence
4. Add health check to Dockerfile
5. Optimize image size
6. Test container build
7. Test data persistence across restarts
8. Document Docker deployment

**Deliverables:**
- Working Dockerfile
- Docker Compose configuration
- Persistent storage working
- Deployment documentation

**Estimated Effort:** 4-6 hours

---

### Phase 10: Testing & Documentation (Story 10)
**Goal:** Comprehensive testing and documentation

**Tasks:**
1. Write integration tests
2. Test multi-agent scenario
3. Test persistence across restarts
4. Performance testing (100+ tasks)
5. Write user documentation
6. Write API reference
7. Create example agent workflows
8. Update README

**Deliverables:**
- Integration test suite
- User documentation
- API reference
- Example workflows
- Complete README

**Estimated Effort:** 8-12 hours

---

## Total Estimated Effort
**Minimum:** 46 hours  
**Maximum:** 72 hours  
**Average:** 59 hours (~1.5 weeks full-time)

## Dependencies and Prerequisites

### Development Environment
- Node.js 20+ installed
- Docker installed
- Git installed
- Code editor (VS Code recommended)
- Terminal access

### Skills Required
- TypeScript/JavaScript proficiency
- Basic SQL knowledge
- Docker basics
- Understanding of async/await patterns
- Familiarity with MCP protocol (can learn during implementation)

## Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| MCP SDK learning curve | Medium | Medium | Start with examples, reference documentation |
| SQLite concurrency issues | Medium | Low | Use WAL mode, limit to reasonable agent count |
| Docker volume permissions | Low | Medium | Document proper permission setup |
| SSE connection stability | Medium | Low | Add reconnection logic in clients |
| Data corruption on crash | High | Low | SQLite WAL mode, proper shutdown handling |

## Testing Strategy

### Unit Tests
- Service layer methods
- Validation logic
- Database operations

### Integration Tests
- Full tool workflows (create → update → query → delete)
- Resource access patterns
- Multi-agent scenarios

### Manual Tests
- Docker container restart with persistence
- Multiple agent connections
- Large dataset performance (1000+ tasks)
- Network interruption recovery (SSE mode)

### Test Scenarios

**Scenario 1: Single Agent Workflow**
1. Agent creates task
2. Agent updates task status
3. Agent adds comments
4. Agent adds links
5. Agent completes task
6. Verify all data persists

**Scenario 2: Multi-Agent Handoff**
1. Product agent creates task, assigns to architect
2. Architect agent queries queue, finds task
3. Architect works on task, adds comments/links
4. Architect reassigns to code agent
5. Code agent completes implementation
6. Verify handoff chain in task history

**Scenario 3: Persistence**
1. Create tasks with comments and links
2. Stop Docker container
3. Start Docker container
4. Verify all data still accessible

**Scenario 4: Concurrent Access**
1. Multiple agents query queue simultaneously
2. Multiple agents update different tasks
3. Verify no data corruption
4. Verify performance is acceptable

## Deployment Strategy

### Development Deployment
- Local machine
- Stdio mode for single-agent testing
- Direct `npm run dev` execution

### Production Deployment
- Docker container on server
- SSE mode for multi-agent access
- Docker Compose for orchestration
- Host directory mount for persistence

### Rollout Plan
1. Deploy to dev environment
2. Test with 2-3 agents
3. Deploy to staging/test environment
4. Test with 10+ agents
5. Deploy to production
6. Monitor and iterate

## Monitoring and Maintenance

### Monitoring
- Docker health checks
- Application logs (stderr)
- Database file size
- Query performance (slow query log if needed)

### Maintenance Tasks
- Weekly database backup verification
- Monthly backup restore test
- Monitor database size growth
- Update dependencies quarterly
- Security updates as needed

### Success Metrics
- **Availability:** 99%+ uptime
- **Performance:** < 100ms average tool execution time
- **Capacity:** Support 50+ concurrent agents
- **Data Integrity:** Zero data loss incidents

## Future Enhancements (Post-MVP)

### Version 1.1
- Task history/audit trail enabled by default
- Full-text search on task descriptions
- Bulk operations (assign multiple tasks)
- Task templates

### Version 2.0
- PostgreSQL support for true multi-instance
- Authentication and authorization
- WebSocket transport option
- Metrics and analytics
- Web UI for monitoring

### Version 3.0
- Workflow engine (task dependencies)
- Scheduled tasks
- Notifications/webhooks
- Advanced querying (GraphQL?)

## Success Criteria

### MVP is considered complete when:
- ✅ All 15+ tools are implemented and working
- ✅ All 7+ resources are implemented and working
- ✅ Both stdio and SSE modes work
- ✅ Data persists across Docker container restarts
- ✅ Multiple agents can collaborate on tasks
- ✅ Documentation is complete
- ✅ Docker image builds successfully
- ✅ Integration tests pass

### Production-ready when:
- ✅ Performance tests pass with 50+ agents
- ✅ Backup/restore procedure tested
- ✅ 1 week of successful operation in test environment
- ✅ Security review completed
- ✅ Deployment runbook created

## References

- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-23 | Architect | Initial implementation plan |
