# TinyTask Database Schema

## Overview
SQLite database with 4 main tables: tasks, comments, links, and task_history (for audit trail).

## Tables

### tasks
Primary table for task management with agent queue support.

```sql
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK(status IN ('idle', 'working', 'complete')),
    assigned_to TEXT,
    previous_assigned_to TEXT,
    created_by TEXT,
    priority INTEGER DEFAULT 0,
    tags TEXT,  -- JSON array of tags
    parent_task_id INTEGER,  -- For hierarchical subtasks
    queue_name TEXT,  -- For queue-based task organization
    blocked_by_task_id INTEGER,  -- For task blocking relationships
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,  -- Set when status becomes 'complete'; cleared on reopen
    archived_at DATETIME,
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_by_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned_status ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_archived ON tasks(archived_at);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_queue_name ON tasks(queue_name);
CREATE INDEX idx_tasks_queue_status ON tasks(queue_name, status);
CREATE INDEX idx_tasks_blocked_by ON tasks(blocked_by_task_id);
```

**Key Design Decisions:**
- `assigned_to` is TEXT to allow flexible agent names without validation
- `previous_assigned_to` tracks task handoff history
- `tags` stored as JSON for flexibility
- `archived_at` NULL means active, non-NULL means archived
- Compound index on `(assigned_to, status)` for efficient queue queries
- `parent_task_id` enables hierarchical task organization with CASCADE delete
- `queue_name` allows flexible queue-based task organization
- `completed_at` records when a task transitioned to `complete` (null otherwise; cleared on reopen; inherited through automatic parent promotion)
- `blocked_by_task_id` enables task blocking with SET NULL on delete (preserves blocked task if blocker is deleted)
- Maximum nesting depth of 4 levels enforced at application layer
- Indexes on `parent_task_id`, `queue_name`, and `blocked_by_task_id` for efficient queries
- Blocking state (`is_currently_blocked`) computed at query time based on blocking task status

### comments
Comments associated with tasks, with full CRUD support for LLMs.

```sql
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_task_id ON comments(task_id);
```

**Key Design Decisions:**
- CASCADE delete ensures orphaned comments are removed
- `created_by` tracks which agent added the comment
- Separate `updated_at` for edit history

### links
Simple link/artifact storage for tasks.

```sql
CREATE TABLE links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_links_task_id ON links(task_id);
```

**Key Design Decisions:**
- `url` can be file paths, URLs, or any reference string
- `description` provides context about the artifact
- CASCADE delete for cleanup

### task_history (Audit trail)
Tracks significant task state changes. Populated on every mutation path since v2.2.0:
creation, field updates (status, assignee, queue, priority, tags, parent, blocked-by,
auto_promote), agent transfers, archive, and automatic parent promotion (actor `system`).
Read via `GET /api/v1/tasks/{id}/history` (REST) or the `get_task_history` MCP tool
(CLI: `tinytask task history <id>`).

```sql
CREATE TABLE task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_history_task_id ON task_history(task_id);
```

**Key Design Decisions:**
- Captures who changed what and when
- `changed_by` records the acting agent: `created_by` on creation, `updated_by` on updates, transferring agent on moves, `system` for auto-promotion
- Rows are written in the same transaction as the mutation they describe
- Useful for debugging agent workflows
- Can be disabled if not needed

## Database Initialization

The server will automatically create tables on first run if they don't exist.

## Data Migration Strategy

Since this is MVP, no formal migrations yet. Schema changes will require:
1. Backup existing data
2. Update schema
3. Migrate data with custom scripts if needed

## Query Patterns

### Agent Queue Query
```sql
SELECT * FROM tasks 
WHERE assigned_to = ? 
  AND status IN ('idle', 'working')
  AND archived_at IS NULL
ORDER BY priority DESC, created_at ASC;
```

### Task with Comments and Links
```sql
-- Get task
SELECT * FROM tasks WHERE id = ?;

-- Get comments
SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC;

-- Get links
SELECT * FROM links WHERE task_id = ? ORDER BY created_at ASC;
```

### Archive Query
```sql
UPDATE tasks 
SET archived_at = CURRENT_TIMESTAMP 
WHERE id = ?;
```
