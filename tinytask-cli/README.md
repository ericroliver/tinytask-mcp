# TinyTask CLI

Command-line client for TinyTask MCP server.

## Installation

### Local Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Link for global usage
npm link

# Test installation
tinytask --version
tinytask --help
```

## Building Standalone Executables

TinyTask CLI uses **Node.js Single Executable Applications (SEA)** to package a true standalone executable that runs without a Node.js installation. See [BUILD.md](BUILD.md) for the full details.

### Package Per Platform

```bash
npm run package-mac       # macOS executable   → dist/tko-macos
npm run package-linux     # Linux executable   → dist/tko-linux
npm run package-windows   # Windows executable → dist/tko-win.exe
```

The Windows build works natively on Windows (uses the local `node.exe`) or
cross-compiled from Linux/macOS (downloads the official win-x64 node binary).

### Distribution

The generated executables are self-contained and can be distributed as-is. Users can run them directly without installing Node.js:

```bash
# Linux/macOS
./tko-linux --version
./tko-macos task list

# Windows
tko-win.exe --version
tko-win.exe task list
```

## Configuration

TinyTask CLI supports multiple configuration sources with the following precedence (highest to lowest):

1. CLI flags (e.g., `--url`)
2. Environment variables (e.g., `TINYTASK_URL`)
3. Active profile in config file
4. Config file defaults
5. Built-in defaults

### Initialize Configuration

```bash
tinytask config init
```

### Configuration File

Create `~/.tinytaskrc` or use other supported formats (`.tinytask.json`, `package.json#tinytask`).

Example configuration:

```json
{
  "url": "http://localhost:3000/mcp",
  "defaultAgent": "myname",
  "outputFormat": "table",
  "colorOutput": true,
  "profiles": {
    "dev": {
      "url": "http://localhost:3000/mcp",
      "defaultAgent": "dev-agent"
    },
    "prod": {
      "url": "https://prod.example.com/mcp",
      "defaultAgent": "prod-agent"
    }
  },
  "activeProfile": "dev"
}
```

### Environment Variables

- `TINYTASK_URL` - Server URL
- `TINYTASK_AGENT` - Default agent name
- `TINYTASK_FORMAT` - Output format (table, json, csv, compact)
- `TINYTASK_NO_COLOR` - Disable colors (set to 'true')
- `TINYTASK_TIMEOUT` - Connection timeout in milliseconds

## Usage

### Global Options

All commands support these global options:

- `--url <url>` - TinyTask server URL
- `--json` - Output as JSON
- `--no-color` - Disable colored output
- `--verbose` - Enable verbose logging
- `--profile <profile>` - Use specific configuration profile

### Task Commands

#### Create Task

```bash
tinytask task create "Task title"
tinytask task create "Task title" -d "Description" -a alice -p 5
tinytask task create "Task title" --assigned-to bob --priority 8 --tags "bug,urgent"

# Create as subtask
tinytask task create "Write tests" --parent 5 --assigned-to alice

# Create and assign to queue
tinytask task create "Fix bug" --queue dev --priority 8
```

#### Get Task

```bash
tinytask task get 1
tinytask task get 1 --json
```

#### Update Task

```bash
tinytask task update 1 --status working
tinytask task update 1 --title "New title" --priority 9
tinytask task update 1 --assigned-to charlie --tags "feature,ui"

# Change parent or make top-level
tinytask task update 10 --parent 5
tinytask task update 10 --parent null

# Change queue
tinytask task update 1 --queue qa
```

#### List Tasks

```bash
tinytask task list
tinytask task ls
tinytask task list --assigned-to alice
tinytask task list --status working --limit 10
tinytask task list --include-archived

# Filter by queue or parent
tinytask task list --queue dev
tinytask task list --parent 5
tinytask task list --exclude-subtasks
```

#### Delete Task

```bash
tinytask task delete 1
tinytask task delete 1 --yes
```

#### Archive Task

```bash
tinytask task archive 1
```

### Subtask Commands

Manage task hierarchies and break down complex work into subtasks.

#### Create Subtask

```bash
tinytask subtask create 5 "Design database schema"
tinytask st create 5 "Write tests" -d "Unit and integration tests" -a alice
tinytask st create 5 "Deploy feature" -p 8 -q qa
```

#### List Subtasks

```bash
tinytask subtask list 5
tinytask st list 5 --recursive
tinytask st list 5 --include-archived
```

#### View Task Tree

```bash
tinytask subtask tree 5
tinytask st tree 5 --recursive
```

Output displays hierarchical task structure:
```
Task #5: User Authentication [dev] (alice)
├── Task #10: Design schema (bob)
│   └── Task #15: Create ERD (alice)
├── Task #11: Write tests (charlie)
└── Task #12: Deploy (unassigned)
```

#### Move Subtask

```bash
# Move to different parent
tinytask subtask move 10 5

# Make top-level task
tinytask st move 10
```

### Queue Management Commands

Organize tasks into team queues (dev, product, qa, etc.).

#### List All Queues

```bash
tinytask queue list
tinytask queue ls
```

#### View Queue Statistics

```bash
tinytask queue stats dev
tinytask queue stats qa --json
```

Output displays queue metrics:
```
Queue: dev
─────────────────────────
Total Tasks:     12
  Idle:          5
  Working:       4
  Complete:      3

Assignment:
  Assigned:      10
  Unassigned:    2

Agents:          alice, bob, charlie
```

#### View Tasks in Queue

```bash
tinytask queue tasks dev
tinytask queue tasks dev --status idle
tinytask queue tasks dev --assigned-to alice
tinytask queue tasks qa --exclude-subtasks
```

#### Add Task to Queue

```bash
tinytask queue add 5 dev
```

#### Remove Task from Queue

```bash
tinytask queue remove 5
```

#### Move Task Between Queues

```bash
tinytask queue move 5 qa
```

#### Clear Queue

```bash
tinytask queue clear dev --yes
```

### Agent Workflow Commands

#### View Agent Queue

```bash
tinytask queue view alice
tinytask queue view --mine
```

#### Signup for Task

```bash
tinytask signup
tinytask signup --agent alice
```

#### Move Task Between Agents

```bash
tinytask move 1 bob
tinytask move 1 bob --from alice
tinytask move 1 bob --comment "Transferring to Bob"
```

### Comment Commands

#### Add Comment

```bash
tinytask comment add 1 "This is a comment"
tinytask c add 1 "Comment text" --created-by alice
```

#### List Comments

```bash
tinytask comment list 1
tinytask c list 1 --json
```

#### Update Comment

```bash
tinytask comment update 10 "Updated comment text"
```

#### Delete Comment

```bash
tinytask comment delete 10
tinytask c delete 10 --yes
```

### Link Commands

#### Add Link

```bash
tinytask link add 1 "https://github.com/user/repo/pull/123"
tinytask l add 1 "https://docs.example.com" -d "Documentation"
```

#### List Links

```bash
tinytask link list 1
tinytask l list 1 --json
```

#### Update Link

```bash
tinytask link update 5 --url "https://new-url.com"
tinytask l update 5 --description "New description"
```

#### Delete Link

```bash
tinytask link delete 5
tinytask l delete 5 --yes
```

### Configuration Commands

#### Initialize Config

```bash
tinytask config init
tinytask config init --force
```

#### Show Config

```bash
tinytask config show
```

#### Set Config Value

```bash
tinytask config set url http://localhost:3000/mcp
tinytask config set defaultAgent alice
tinytask config set outputFormat json
```

#### Get Config Value

```bash
tinytask config get url
tinytask config get defaultAgent
```

#### Profile Management

```bash
# Add profile
tinytask config profile add staging --url https://staging.example.com/mcp --default-agent staging-bot

# List profiles
tinytask config profile list

# Use profile
tinytask config profile use staging

# Remove profile
tinytask config profile remove staging
```

## Output Formats

### Table Format (Default)

Human-readable table output with colors:

```bash
tinytask task list
```

### JSON Format

Machine-parseable JSON:

```bash
tinytask task list --json
tinytask task get 1 --json
```

### CSV Format

Spreadsheet-compatible CSV:

```bash
tinytask task list --output csv > tasks.csv
```

### Compact Format

One-line summary per task:

```bash
tinytask task list --output compact
```

### Tree Format

Hierarchical tree display for subtasks:

```bash
tinytask subtask tree 5
```

### Stats Format

Formatted statistics for queue metrics:

```bash
tinytask queue stats dev
```

## Examples

### Complete Workflow

```bash
# Create a new task
tinytask create "Implement feature X" -d "Add the new feature" -a alice -p 7

# View your queue
tinytask queue alice

# Claim next task
tinytask signup --agent alice

# Update task status
tinytask update 1 --status working

# Add a comment
tinytask comment add 1 "Started working on this"

# Add a link
tinytask link add 1 "https://github.com/org/repo/pull/42"

# Complete the task
tinytask update 1 --status complete

# Archive completed task
tinytask archive 1
```

### Scripting Example

```bash
#!/bin/bash
# Get all idle tasks assigned to alice in JSON format
TASKS=$(tinytask list --assigned-to alice --status idle --json)

# Process each task
echo "$TASKS" | jq -r '.[] | .id' | while read task_id; do
  echo "Processing task $task_id"
  tinytask comment add "$task_id" "Auto-processed by script"
done
```

## Development

```bash
# Run in watch mode
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format

# Clean build directory
npm run clean
```

## Project Structure

```
tinytask-cli/
├── src/
│   ├── index.ts              # Entry point with shebang
│   ├── cli.ts                # Main CLI setup
│   ├── version.ts            # Version constant
│   ├── client/
│   │   ├── mcp-client.ts     # MCP client wrapper
│   │   └── connection.ts     # Connection singleton
│   ├── commands/
│   │   ├── config.ts         # Config commands
│   │   ├── queue.ts          # Queue command
│   │   ├── signup.ts         # Signup command
│   │   ├── move.ts           # Move command
│   │   ├── comment.ts        # Comment commands
│   │   ├── link.ts           # Link commands
│   │   └── task/
│   │       ├── index.ts      # Task command registration
│   │       ├── create.ts     # Create task
│   │       ├── get.ts        # Get task
│   │       ├── update.ts     # Update task
│   │       ├── delete.ts     # Delete task
│   │       ├── list.ts       # List tasks
│   │       └── archive.ts    # Archive task
│   ├── config/
│   │   ├── schema.ts         # Zod schemas
│   │   └── loader.ts         # Config loading logic
│   ├── formatters/
│   │   ├── types.ts          # Formatter interface
│   │   ├── table.ts          # Table formatter
│   │   ├── json.ts           # JSON formatter
│   │   ├── csv.ts            # CSV formatter
│   │   ├── compact.ts        # Compact formatter
│   │   └── index.ts          # Formatter factory
│   └── utils/
│       └── errors.ts         # Error handling
├── tests/
│   ├── cli.test.ts           # CLI tests
│   └── unit/
│       ├── client/
│       ├── config/
│       └── formatters/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

## License

ISC
