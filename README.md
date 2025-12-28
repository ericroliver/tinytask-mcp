# TinyTask MCP

## NOTE:
This is the simplest task management system I could create. I need this for experimentation in a another research project exploring agentic team workflows, collaboration, etc. Probably the biggest gaps are that there is no auth or the concept of users. Tasks are assigned to arbitrary names and the name becomes the queue of work for the name. This project was written entirely using AI (specifically RooCode and Anthropic). From start to finish the initial project took just a few hours and cost about $15.50 in tokens.

## Description

A minimal task management system designed for LLM agent collaboration, exposed as a Model Context Protocol (MCP) server.

## Features

- **Task Management**: Complete CRUD operations for tasks with status tracking (idle, working, complete)
- **Comment System**: Add, update, and delete comments on tasks
- **Link/Artifact Tracking**: Associate URLs and artifacts with tasks
- **Agent Queue Management**: Per-agent task queues with priority sorting
- **Task Assignment & Routing**: Assign and reassign tasks between agents
- **Persistent Storage**: SQLite database with full data persistence
- **Dual Transport**: Supports both stdio (local) and SSE (HTTP) transports
- **Docker Ready**: Containerized deployment with docker-compose

## Quick Start

### Docker (Recommended)

The easiest way to run TinyTask MCP is using Docker:

```bash
# Start the server
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the server
docker-compose down
```

The server will be available at `http://localhost:3000`

### Local Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in SSE mode (HTTP server)
npm run start:sse

# Run in stdio mode (for MCP clients)
npm run start:stdio

# Run in both modes
npm run start:both

# Development mode with auto-reload
npm run dev
```

## MCP Client Configuration

### Stdio Mode (Local)

For local development with MCP clients like Claude Desktop:

```json
{
  "mcpServers": {
    "tinytask": {
      "command": "node",
      "args": ["/path/to/tinytask-mcp/build/index.js"],
      "env": {
        "TINYTASK_MODE": "stdio",
        "TINYTASK_DB_PATH": "/path/to/data/tinytask.db"
      }
    }
  }
}
```

### SSE Mode (Remote)

For remote or HTTP-based access:

```json
{
  "mcpServers": {
    "tinytask": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Environment Variables

- `TINYTASK_MODE`: Server mode (`stdio`, `sse`, or `both`) - default: `both`
- `TINYTASK_PORT`: HTTP server port for SSE mode - default: `3000`
- `TINYTASK_HOST`: HTTP server host for SSE mode - default: `0.0.0.0`
- `TINYTASK_DB_PATH`: Path to SQLite database file - default: `./data/tinytask.db`
- `TINYTASK_LOG_LEVEL`: Logging level - default: `info`

## Logging Configuration

TinyTask MCP supports multiple logging levels for debugging and troubleshooting agent interactions.

### Log Levels

- **`error`**: Only errors (minimal production logging)
- **`warn`**: Warnings and errors
- **`info`**: Important operations (default, backward compatible)
- **`debug`**: Detailed debugging including tool calls and validation
- **`trace`**: Full forensic logging with complete request/response bodies

### Setting Log Level

#### Docker (Recommended)

Edit `docker-compose.yml`:

```yaml
environment:
  TINYTASK_LOG_LEVEL: trace  # Change from 'info' to enable forensic logging
```

Then restart:

```bash
docker-compose down
docker-compose up -d
docker-compose logs -f tinytask  # Watch logs in real-time
```

#### Local Development

```bash
# Set for single run
TINYTASK_LOG_LEVEL=debug npm run dev

# Or export for session
export TINYTASK_LOG_LEVEL=trace
npm run dev
```

#### MCP Client (stdio mode)

```json
{
  "mcpServers": {
    "tinytask": {
      "command": "node",
      "args": ["/path/to/tinytask-mcp/build/index.js"],
      "env": {
        "TINYTASK_MODE": "stdio",
        "TINYTASK_LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Troubleshooting Agent Issues

If an agent (like goose) is having issues creating tasks or performing operations:

1. **Enable forensic logging** by setting `TINYTASK_LOG_LEVEL=trace`
2. **Reproduce the issue** with the agent
3. **Review the logs** for:
   - Full request body showing what the agent sent
   - Validation errors indicating missing or invalid fields
   - Full response body showing what was returned
   - Tool execution errors with stack traces

4. **Common issues revealed by trace logging**:
   - Missing required fields in requests
   - Wrong data types (e.g., string instead of number)
   - Invalid enum values for status
   - Session management problems in SSE mode
   - Encoding issues in request bodies

5. **Return to normal logging** after troubleshooting by setting `TINYTASK_LOG_LEVEL=info`

### Performance Impact

- **error/warn/info**: Negligible overhead (< 1ms per request)
- **debug**: Minimal overhead (~1-2ms per request)
- **trace**: Small overhead (~3-5ms per request) - use only for troubleshooting

## API Overview

### Tools

TinyTask MCP exposes the following tools for LLM agents:

#### Task Tools
- `create_task` - Create a new task
- `update_task` - Update an existing task
- `get_task` - Retrieve a task by ID
- `delete_task` - Delete a task
- `archive_task` - Archive a completed task
- `list_tasks` - List all tasks
- `get_my_queue` - Get tasks assigned to a specific agent

#### Comment Tools
- `add_comment` - Add a comment to a task
- `update_comment` - Update a comment
- `delete_comment` - Delete a comment
- `list_comments` - List all comments for a task

#### Link Tools
- `add_link` - Add a link/artifact to a task
- `update_link` - Update a link
- `delete_link` - Delete a link
- `list_links` - List all links for a task

### Resources

TinyTask MCP provides the following resources:

- `task://{id}` - Full task details with comments and links
- `queue://{agent_name}` - Agent's task queue
- `tasks://active` - All active (non-archived) tasks
- `tasks://idle` - All idle tasks
- `tasks://working` - All tasks in progress
- `tasks://complete` - All completed tasks
- `tasks://by-priority` - Tasks sorted by priority
- `tasks://unassigned` - Tasks not assigned to any agent

For detailed API documentation, see [API Documentation](docs/technical/mcp-api-design.md)

## Architecture

TinyTask MCP follows a layered architecture:

1. **Transport Layer**: Handles stdio and SSE communication
2. **MCP Server Layer**: Implements MCP protocol (tools & resources)
3. **Service Layer**: Business logic for tasks, comments, and links
4. **Database Layer**: SQLite with Better-SQLite3

For detailed architecture documentation, see [Architecture Documentation](docs/technical/architecture.md)

## Example Workflows

### Feature Development Workflow

1. **Product Agent** creates a feature request:
```typescript
create_task({
  title: "Add dark mode toggle",
  description: "Users want dark mode option",
  assigned_to: "architect-agent",
  created_by: "product-agent",
  priority: 10
})
```

2. **Architect Agent** designs the solution:
```typescript
// Check queue
get_my_queue({ agent_name: "architect-agent" })

// Start working
update_task({ id: 1, status: "working" })

// Add design document
add_link({
  task_id: 1,
  url: "/docs/dark-mode-design.md",
  description: "Architecture design"
})

// Reassign to developer
update_task({
  id: 1,
  assigned_to: "code-agent",
  status: "idle"
})
```

3. **Code Agent** implements:
```typescript
// Check queue
get_my_queue({ agent_name: "code-agent" })

// Implement and complete
update_task({ id: 1, status: "working" })
add_comment({ task_id: 1, content: "Implementation complete" })
update_task({ id: 1, status: "complete" })
```

4. **Integration Agent** archives:
```typescript
archive_task({ id: 1 })
```

For more examples, see [Example Workflows](docs/examples/workflows.md)

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build the project
npm run build

# Format code
npm run format

# Lint code
npm run lint

# Clean build artifacts
npm run clean
```

## Deployment

See [Deployment Guide](docs/deployment.md) for production deployment instructions.

## Troubleshooting

See [Troubleshooting Guide](docs/troubleshooting.md) for common issues and solutions.

## Technical Documentation

- [Architecture](docs/technical/architecture.md)
- [Database Schema](docs/technical/database-schema.md)
- [MCP API Design](docs/technical/mcp-api-design.md)
- [Docker Deployment](docs/technical/docker-deployment.md)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

ISC

## Support

For issues and questions, please file an issue on GitHub.
