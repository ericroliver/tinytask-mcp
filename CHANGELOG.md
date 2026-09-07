# Changelog

All notable changes to TinyTask MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.2] - 2026-09-07

### Fixed
- **`signup_for_task` MCP tool now returns machine-readable JSON** (defect #899):
  success returns the claimed task object (status `working`, agent assigned);
  an empty queue returns JSON `null`. Previously both paths returned
  human-readable text ("No idle tasks available in queue for agent: X" /
  "Task #N claimed and set to working status\n\n{json}"), which broke
  JSON-expecting clients — the tinytask CLI aborted with a parse error on
  every signup, taking agent tool calls down with a libuv abort on Windows
  (exit -1073740791). Tool description now documents the contract;
  technical/final-spec docs updated; handler-level contract tests added.
- **CLI 0.6.0 companion release** (defects #898, #900): tolerant signup
  parsing (older server text shapes still understood), actionable
  "Unknown tool" guidance when calling `get_task_history` against stale
  servers (< 2.2.0), regression tests for `task delete --yes` /
  `queue clear --yes`, and graceful shutdown (disconnect before exit plus
  global unhandledRejection/uncaughtException handlers) so CLI errors exit
  cleanly instead of hard-aborting on Windows SEA builds.

## [2.2.1] - 2026-09-05

### Changed
- CLI 0.5.1 build/packaging: SEA build outputs renamed to `tko-*` (`dist/tko-macos`,
  `dist/tko-linux`, `dist/tko-win.exe`); new Windows build + install support
  (`deploy-windows.sh`, `sea:windows` now uses the local `node.exe` when run on
  Windows and gained a PowerShell extraction fallback for cross-builds); fixed
  `deploy-macos.sh` calling the non-existent `npm run package` script. The installed
  command name (`tinytask`) is unchanged.

## [2.2.0] - 2026-09-05

### Added
- **Task history audit trail is now live** (previously documented but never populated):
  every task change — creation, field updates (status, assignee, queue, priority, tags,
  parent, blocked-by, auto_promote), agent transfers, archive, and queue add/remove/move —
  is recorded to the `task_history` table with old value, new value, acting agent, and
  timestamp. Auto-promotion of parent tasks is recorded with actor `system`.
- `completed_at` task field: set when a task transitions to `complete`, cleared on reopen,
  null otherwise. Included in task responses (MCP/REST/CLI).
- `GET /api/v1/tasks/{id}/history` (REST) and `get_task_history` (MCP) to read a task's
  history (chronological, oldest first).
- Optional `updated_by` actor on task updates (REST PATCH body / MCP `update_task` /
  `updated_by` param) recorded as the change author in history.
- CLI 0.5.0: `task history <id>` command (table or `--json`).

### Fixed
- 32 long-failing tests on main repaired (no assertions weakened):
  transport/server suites bound `localhost` which resolves to IPv6 `::1` on lab machines
  while the test HTTP clients connect to `127.0.0.1` (now bind/connect via `127.0.0.1`);
  `moveTask` service tests asserted the pre-refactor return shape (now
  `{ task, comment }`).

## [2.1.0] - 2026-09-05
### Changed
- **Task list responses are much slimmer by default** (token burn fix). `list_tasks` (MCP),
  `GET /api/v1/tasks` and `GET /api/v1/agents/{name}/queue` now:
  - omit the `description` field from each task (descriptions were ~62% of list payload),
  - cap results at 100 unless an explicit `limit` is passed (previously unbounded).
  Request `include_description=true` (REST query param / MCP tool arg) to get full
  descriptions, or set server env `TINYTASK_LIST_INCLUDE_DESCRIPTION=true` to restore the
  old behavior globally.

### Added
- CLI 0.4.0: `task list --full` (include descriptions), `task list --fields id,title,...`
  (client-side field projection), `task list --format table|json|csv|compact`
  (per-invocation format override).
- `auto_promote` opt-out for parent status auto-promotion (per task, default true).
  Create/update tasks with `auto_promote: false` (MCP/REST) or
  `--no-auto-promote` (CLI) so the task's status is never auto-flipped by its
  children. Promotion writes now flow through `update()` — they refresh
  `updated_at` and emit `task-updated` / `task-status-changed` events instead of
  bypassing the service layer.

### Fixed
- CLI: `queue list` and `queue view` render correctly in table, compact and csv formats
  (previously fell through to the single-task formatter and printed `Task #undefined`).
- CLI: `ping` performs a real server round-trip, reports URL + latency, and exits non-zero
  when the server is unreachable.

## [1.0.0] - 2024-01-01

### Initial Release

#### Added
- **Core Task Management**
  - Create, read, update, and delete tasks
  - Task status tracking (idle, working, complete)
  - Task priority system
  - Task assignment to agents
  - Task archival for completed tasks
  
- **Comment System**
  - Add comments to tasks
  - Update and delete comments
  - List all comments for a task
  - Comment timestamps and creator tracking
  
- **Link/Artifact System**
  - Add links/artifacts to tasks
  - Update and delete links
  - List all links for a task
  - Link descriptions and creator tracking
  
- **Agent Queue Management**
  - Per-agent task queues
  - Priority-based queue sorting
  - Queue filtering by agent name
  - Queue statistics
  
- **MCP Server Implementation**
  - Full MCP protocol support
  - 16 tools for task, comment, and link operations
  - 8 resource URIs for data access
  - Comprehensive tool parameter validation
  
- **Dual Transport Support**
  - stdio transport for local MCP clients
  - SSE (Server-Sent Events) over HTTP transport
  - Both transports mode for development
  - Configurable via environment variables
  
- **Database Layer**
  - SQLite database with Better-SQLite3
  - Automatic schema initialization
  - Foreign key constraints
  - Proper indexing for performance
  - WAL mode support
  
- **Docker Support**
  - Production Dockerfile
  - Development Dockerfile
  - docker-compose.yml for easy deployment
  - docker-compose.dev.yml for development
  - Health check endpoints
  - Volume mounting for data persistence
  
- **Testing Suite**
  - Integration tests for multi-agent workflows
  - Persistence tests for data durability
  - Performance tests (100+ tasks)
  - Error scenario tests
  - Test helper utilities
  - Jest configuration for TypeScript
  
- **Documentation**
  - Comprehensive README
  - API reference documentation
  - Example agent workflows
  - Troubleshooting guide
  - Deployment guide
  - Architecture documentation
  - Database schema documentation
  - Docker deployment guide

#### Technical Details
- TypeScript implementation with strict mode
- ESM module system
- Zod schema validation
- Express.js for HTTP server
- Better-SQLite3 for database
- MCP SDK 0.5.0

#### Developer Tools
- ESLint configuration
- Prettier code formatting
- TypeScript strict mode
- Build scripts
- Development watch mode
- Clean build process

---

## [1.1.0] - 2025-01-15

### Added

#### High-Level Task Tools for Token Efficiency

Two new atomic task management tools that significantly reduce token consumption by combining multiple operations into single transactions:

- **`signup_for_task` Tool**
  - Atomically claims the highest priority idle task from an agent's queue
  - Updates task status to 'working' in single operation
  - Returns complete task with comments and links
  - Respects priority ordering (higher priority first)
  - Respects creation time ordering (older tasks first within same priority)
  - **Token Savings**: ~58% reduction (3 calls → 1 call)
  
- **`move_task` Tool**
  - Atomically transfers task to another agent with status reset to 'idle'
  - Adds handoff comment from current agent
  - Returns updated task with all comments and links
  - Validates task ownership and status
  - Prevents transfers of completed tasks
  - **Token Savings**: ~45% reduction (3 calls → 1 call)

#### Service Layer Enhancements
- Added `TaskService.signupForTask(agentName)` method
- Added `TaskService.moveTask(taskId, currentAgent, newAgent, comment)` method
- Both methods use database transactions for atomicity
- Comprehensive error handling with descriptive messages

#### Type Safety Improvements
- Added `SignupForTaskParams` interface
- Added `MoveTaskParams` interface
- Full TypeScript type coverage for new features

### Improved

- **Token Efficiency**: Reduced token consumption by 40-60% for common agent workflows
- **Workflow Performance**: Faster task operations with fewer round-trips
- **Transaction Safety**: All high-level operations are atomic with auto-rollback
- **Test Coverage**: Added 24 comprehensive tests for new features (now 75 total tests)

### Technical Details

- Transaction-based implementations ensure data consistency
- Priority ordering: `ORDER BY priority DESC, created_at ASC`
- Status changes: `signup_for_task` changes idle→working, `move_task` changes any→idle
- All operations complete in <100ms under normal load

### Documentation

- Added [`docs/technical/high-level-tools-implementation-plan.md`](docs/technical/high-level-tools-implementation-plan.md:1)
- Added [`docs/technical/high-level-tools-summary.md`](docs/technical/high-level-tools-summary.md:1)
- Updated product story documentation
- Added comprehensive usage examples

---

## [Unreleased]

### Planned Features
- Authentication and authorization
- Multi-user support
- Task templates
- Task dependencies
- Due dates and reminders
- Task labels/tags
- Search functionality
- Batch operations
- Export/import capabilities
- Webhooks for notifications
- REST API alongside MCP
- GraphQL API option
- Performance metrics endpoint
- Admin dashboard

### Under Consideration
- Task history/audit log
- File attachments
- Task relations (parent/child)
- Custom fields
- Workflow automation
- Integration with external services
- Multi-database support
- Clustering for high availability
- Realtime updates via WebSockets

---

## Version History

### Version Numbering

- **Major version** (X.0.0): Breaking changes, major feature additions
- **Minor version** (x.X.0): New features, non-breaking changes
- **Patch version** (x.x.X): Bug fixes, minor improvements

### Upgrade Notes

#### Upgrading to 1.0.0
- Initial release - no upgrade path needed
- Database schema is automatically initialized on first run
- Environment variables:
  - `TINYTASK_MODE`: Set to `stdio`, `sse`, or `both`
  - `TINYTASK_PORT`: HTTP port for SSE mode (default: 3000)
  - `TINYTASK_DB_PATH`: Database file location (default: ./data/tinytask.db)

---

## Support

For questions, issues, or feature requests:
- GitHub Issues: [Create an issue](https://github.com/yourusername/tinytask-mcp/issues)
- Documentation: See [docs/](docs/) directory
- Email: support@example.com (if applicable)

---

## Contributors

Thanks to all contributors who have helped build TinyTask MCP!

---

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.
