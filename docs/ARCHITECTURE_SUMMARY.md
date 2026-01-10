# TinyTask MCP - Architecture Summary

## Executive Summary

**TinyTask MCP** is a minimal task management system designed specifically for LLM agent collaboration. It exposes task management functionality via the Model Context Protocol (MCP), allowing autonomous agents to create, manage, and collaborate on tasks without human intervention.

## Key Features

✅ **Task Management** - Full CRUD operations with status tracking (idle, working, complete)  
✅ **Agent Queues** - Each agent can query their assigned tasks  
✅ **Collaboration** - Comments and links enable agent communication  
✅ **Persistence** - SQLite database with Docker volume persistence  
✅ **Flexible Transport** - Stdio (local) plus Streamable HTTP (default) with SSE legacy fallback  
✅ **Production Ready** - Docker packaging with health checks

## Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js 20+ | LTS, excellent async support |
| Language | TypeScript | Type safety, better development experience |
| Framework | MCP SDK | Official protocol implementation |
| Database | SQLite3 | Embedded, zero-config, sufficient for MVP |
| Container | Docker | Portability and isolation |
| HTTP | Express.js | Streamable HTTP default, SSE legacy |

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   LLM Agents                        │
│  (Product, Architect, Code, Review, QA, etc.)       │
└──────────────┬──────────────────────────────────────┘
               │ MCP Protocol (stdio/HTTP)
┌──────────────▼──────────────────────────────────────┐
│              TinyTask MCP Server                    │
│  ┌─────────────────────────────────────────────┐   │
│  │  Tools (15+): create_task, update_task,     │   │
│  │              add_comment, add_link, etc.    │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Resources (7+): task://{id},               │   │
│  │                  queue://{agent}, etc.      │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Services: TaskService, CommentService,     │   │
│  │            LinkService                      │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Database: SQLite with WAL mode             │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
               │ Volume Mount
┌──────────────▼──────────────────────────────────────┐
│         Host Filesystem (Persistence)               │
└─────────────────────────────────────────────────────┘
```

## Database Schema

4 tables supporting the core functionality:

1. **tasks** - Core entity with status, assignment, priority, tags
2. **comments** - Agent collaboration via comments
3. **links** - Artifact references (code, docs, etc.)
4. **task_history** - Optional audit trail

Key design decisions:
- Soft delete via `archived_at` timestamp
- Foreign keys with CASCADE delete
- Indexes on query paths (assigned_to, status)
- WAL mode for better concurrency

See: [`docs/technical/database-schema.md`](technical/database-schema.md)

## MCP API

### Tools (Actions)
**Task Tools (7):**
- create_task, update_task, get_task, delete_task, archive_task, list_tasks, get_my_queue

**Comment Tools (4):**
- add_comment, update_comment, delete_comment, list_comments

**Link Tools (4):**
- add_link, update_link, delete_link, list_links

### Resources (Data Access)
- `task://{id}` - Full task with comments/links
- `task://{id}/comments` - Task comments
- `task://{id}/links` - Task links
- `queue://{agent_name}` - Agent's open tasks
- `queue://{agent_name}/summary` - Queue statistics
- `tasks://active` - All active tasks
- `tasks://archived` - Archived tasks

See: [`docs/technical/mcp-api-design.md`](technical/mcp-api-design.md)

## Deployment

### Docker Container
- **Base Image:** node:20-alpine (~80-100MB final size)
- **User:** Non-root (node user) for security
- **Health Check:** HTTP endpoint at /health
- **Persistence:** Volume mount `/data` to host

### Transport Modes

**Stdio Mode** (Local Development)
```bash
docker run -v ./data:/data -e TINYTASK_MODE=stdio tinytask-mcp
```

**Streamable HTTP Mode** (Production Multi-Agent)
```bash
docker run -p 3000:3000 -v ./data:/data -e TINYTASK_MODE=http tinytask-mcp
```

**Both Modes**
```bash
docker run -p 3000:3000 -v ./data:/data -e TINYTASK_MODE=both tinytask-mcp
```

**Legacy SSE**
```bash
docker run -p 3000:3000 -v ./data:/data -e TINYTASK_MODE=http -e TINYTASK_ENABLE_SSE=true tinytask-mcp
```

See: [`docs/technical/docker-deployment.md`](technical/docker-deployment.md)

## Implementation Plan

### 10 Development Stories (~46-72 hours total)

| Story | Description | Effort | Priority |
|-------|-------------|--------|----------|
| 1 | Project Setup | 2-4h | P0 |
| 2 | Database Layer | 4-6h | P0 |
| 3 | Service Layer | 8-12h | P0 |
| 4 | MCP Tools | 8-12h | P0 |
| 5 | MCP Resources | 4-6h | P1 |
| 6 | Stdio Transport | 2-4h | P1 |
| 7 | SSE Transport | 4-6h | P0 |
| 8 | Entry Point | 2-4h | P0 |
| 9 | Docker Packaging | 4-6h | P0 |
| 10 | Testing & Docs | 8-12h | P0 |

**Estimated Timeline:** 1.5-2 weeks full-time development

See: [`docs/technical/implementation-plan.md`](technical/implementation-plan.md)

## Example Agent Workflow

```
1. Product Agent → creates task "Add dark mode"
                 → assigns to Architect Agent

2. Architect Agent → queries own queue
                   → finds task, sets status to "working"
                   → adds comment: "Analyzing requirements"
                   → adds link: "/docs/dark-mode-design.md"
                   → assigns to Code Agent

3. Code Agent → implements feature
              → adds link: "/src/theme.ts"
              → adds comment: "Implementation complete"
              → assigns to Review Agent

4. Review Agent → reviews code
                → marks status "complete"
                → assigns to Integration Agent

5. Integration Agent → deploys to production
                     → archives task
```

## Success Metrics

### Performance
- **Response Time:** < 100ms per tool call
- **Capacity:** 50+ concurrent agents
- **Uptime:** 99%+ availability

### Functionality
- All 15+ tools working
- All 7+ resources accessible
- Data persists across restarts
- Multi-agent workflows successful

## Security Considerations

### MVP (Trusted Network)
- ❌ No authentication
- ❌ No authorization
- ❌ No encryption (localhost only)

### Future Hardening
- ✅ API key authentication
- ✅ Agent-level permissions
- ✅ TLS for SSE mode
- ✅ Rate limiting
- ✅ Audit logging

## Scaling Path

### Current MVP Capacity
- **Agents:** 10-100 concurrent
- **Tasks:** 10,000+
- **Database:** SQLite with WAL mode
- **Deployment:** Single container

### Future Scaling
1. **Database:** SQLite → PostgreSQL
2. **Instances:** Single → Multiple behind load balancer
3. **Monitoring:** Add metrics and alerting
4. **Features:** Workflow engine, dependencies, templates

## Documentation Structure

```
docs/
├── technical/
│   ├── database-schema.md
│   ├── mcp-api-design.md
│   ├── architecture.md
│   ├── docker-deployment.md
│   └── implementation-plan.md
├── product/
│   └── tinytask-mcp-prd.md
└── product-stories/
    └── tinytask-mcp/
        ├── story-01-project-setup.md
        ├── story-02-database-layer.md
        ├── story-03-service-layer.md
        ├── story-04-mcp-tools.md
        ├── story-05-mcp-resources.md
        ├── story-06-stdio-transport.md
        ├── story-07-sse-transport.md
        ├── story-08-entry-point.md
        ├── story-09-docker-packaging.md
        └── story-10-testing-documentation.md
```

## Next Steps

1. **Review & Approve** this architecture plan
2. **Switch to Code Mode** to begin implementation
3. **Follow stories 1-10** in sequence
4. **Test thoroughly** at each phase
5. **Deploy** to production environment

## Questions?

Refer to the detailed documentation:
- [Technical Architecture](technical/architecture.md)
- [API Design](technical/mcp-api-design.md)
- [Implementation Plan](technical/implementation-plan.md)
- [Product PRD](product/tinytask-mcp-prd.md)

---

**Ready to build?** Switch to Code mode to start Story 1: Project Setup
