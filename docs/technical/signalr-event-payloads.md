# TinyTask SignalR Event Payloads

> **Version**: 1.0 — July 2025
> **Audience**: Task Dashboard developers and any consumer listening to the TinyTask SignalR agent hub.

This document describes every event type TinyTask broadcasts to the SignalR agent hub, the
envelope structure, the core context fields present in each payload, and a full field reference
for every payload.

---

## 1. Transport Overview

| Property | Value |
|---|---|
| **Library** | `@microsoft/signalr` |
| **Hub URL** | Configured via `TINYTASK_SIGNALR_URL` env var |
| **Target Group** | Configured via `TINYTASK_SIGNALR_GROUP` env var (e.g. `stimuli`) |
| **Hub Method (grouped)** | `SendToGroup(group, message)` |
| **Hub Method (broadcast)** | `BroadcastMessage(message)` — used when no group is configured |
| **Group Join** | `JoinGroup(group)` — called on connect and on reconnect |
| **Rate Limiting** | Sliding window — default 60 msg/min, burst of 10 msg/10s |
| **Queue** | In-memory, max 500 messages; oldest dropped if full |
| **Reconnection** | Automatic with backoff; re-joins group after reconnect |

---

## 2. Message Envelope

Every event is wrapped in a `HubMessage` envelope before being sent to the hub.

```json
{
  "type": "task-created",
  "timestamp": "2025-07-29T22:41:00.000Z",
  "payload": { ... },
  "metadata": {
    "source": "tinytask",
    "priority": "normal",
    "ttl": 300,
    "correlationId": "abc-123"
  }
}
```

### Envelope Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | ✅ | Event type identifier. Matches `^[a-zA-Z0-9_-]+$`, max 50 chars. See [§4 Event Types](#4-event-types). |
| `timestamp` | `string` | ✅ | ISO 8601 UTC timestamp of when the event was created. |
| `payload` | `object` | ✅ | Event-specific data. Always includes `taskId` (except `queue-cleared`). See [§5 Payload Reference](#5-payload-reference). |
| `metadata` | `object` | ❌ | Optional metadata. Defaults to `{ source: "tinytask", priority: "normal" }`. |

### Metadata Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `source` | `string` | `"tinytask"` | Originating system identifier. |
| `priority` | `"low" \| "normal" \| "high"` | `"normal"` | Message priority. |
| `ttl` | `number` | *(not set)* | Time-to-live in seconds (1–86400). |
| `correlationId` | `string` | *(not set)* | Optional correlation/tracing ID. |

---

## 3. Core Task Context Fields

Every event payload (except `queue-cleared`) includes these four core fields. They provide
enough context to route or filter events without an additional database lookup.

| Field | Type | Nullable | Description |
|---|---|---|---|
| `assignee` | `string` | ✅ `null` | Agent currently assigned to the task. `null` if unassigned. |
| `owner` | `string` | ✅ `null` | Agent that created the task. `null` if not recorded. |
| `status` | `string` | ❌ | Current lifecycle status: `"idle"`, `"working"`, or `"complete"`. |
| `cue` | `string` | ✅ `null` | Queue (cue) the task belongs to. `null` if not in a queue. |

> **Note**: The `status` field reflects the task's status **at the time the event was emitted**.
> For events that *change* the status (e.g. `task-status-changed`), the `status` context field
> reflects the **new** status (the `after` value).

---

## 4. Event Types

All 19 event types broadcast by TinyTask:

| # | Event Type | Description | Has Task Context? |
|---|---|---|---|
| 1 | `task-created` | A new task was created | ✅ |
| 2 | `task-updated` | An existing task was modified | ✅ |
| 3 | `task-deleted` | A task was permanently deleted | ✅ |
| 4 | `task-archived` | A task was archived | ✅ |
| 5 | `task-status-changed` | A task's status was changed | ✅ |
| 6 | `task-assigned` | A task was assigned to an agent | ✅ |
| 7 | `task-transferred` | A task was transferred between agents | ✅ |
| 8 | `task-signed-up` | An agent self-assigned a task | ✅ |
| 9 | `task-queue-changed` | A task was moved between queues | ✅ |
| 10 | `task-added-to-queue` | A task was added to a specific queue | ✅ |
| 11 | `task-removed-from-queue` | A task was removed from a queue | ✅ |
| 12 | `queue-cleared` | An entire queue was cleared | ❌ |
| 13 | `subtask-created` | A subtask was created under a parent task | ✅ |
| 14 | `subtask-moved` | A subtask was moved to a different parent | ✅ |
| 15 | `comment-added` | A comment was added to a task | ✅ |
| 16 | `comment-updated` | A comment was edited | ✅ |
| 17 | `comment-deleted` | A comment was deleted | ✅ |
| 18 | `link-added` | A link was added to a task | ✅ |
| 19 | `link-updated` | A link was edited | ✅ |

> **`link-deleted`** is event type #20 — included in the codebase as `LinkDeletedPayload` but
> noted here for completeness. It also carries task context.

| # | Event Type | Description | Has Task Context? |
|---|---|---|---|
| 20 | `link-deleted` | A link was deleted from a task | ✅ |

---

## 5. Payload Reference

Below is the complete payload structure for each event type.

> **Convention**: Fields marked with **[context]** are the four core `TaskContext` fields
> (`assignee`, `owner`, `status`, `cue`) described in [§3](#3-core-task-context-fields).
> They appear in every payload except `queue-cleared`.

### 5.1 `task-created`

Emitted when a new task is created.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the newly created task |
| `task` | `ParsedTask` | Full task object (see [§6.1](#61-parsedtask)) |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

**Example payload:**
```json
{
  "taskId": 42,
  "task": {
    "id": 42,
    "title": "Implement login page",
    "description": "Create the login UI component",
    "status": "idle",
    "assigned_to": null,
    "previous_assigned_to": null,
    "created_by": "tko-sword",
    "priority": 3,
    "tags": ["frontend", "auth"],
    "parent_task_id": null,
    "queue_name": "tko-sword",
    "blocked_by_task_id": null,
    "is_currently_blocked": false,
    "created_at": "2025-07-29T22:41:00.000Z",
    "updated_at": "2025-07-29T22:41:00.000Z",
    "archived_at": null
  },
  "assignee": null,
  "owner": "tko-sword",
  "status": "idle",
  "cue": "tko-sword"
}
```

---

### 5.2 `task-updated`

Emitted when an existing task is modified.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the updated task |
| `before` | `Partial<ParsedTask>` | Snapshot of changed fields before the update |
| `after` | `ParsedTask` | Full task object after the update (see [§6.1](#61-parsedtask)) |
| `changedFields` | `string[]` | List of field names that were changed |
| `assignee` | `string \| null` | *[context]* — reflects post-update state |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* — reflects post-update state |
| `cue` | `string \| null` | *[context]* — reflects post-update state |

**Example payload:**
```json
{
  "taskId": 42,
  "before": { "status": "idle", "assigned_to": null },
  "after": { "id": 42, "title": "Implement login page", "..." : "..." },
  "changedFields": ["status", "assigned_to"],
  "assignee": "tko-sword",
  "owner": "tko-sword",
  "status": "working",
  "cue": "tko-sword"
}
```

---

### 5.3 `task-deleted`

Emitted when a task is permanently deleted.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the deleted task |
| `assignee` | `string \| null` | *[context]* — captured before deletion |
| `owner` | `string \| null` | *[context]* — captured before deletion |
| `status` | `string` | *[context]* — captured before deletion |
| `cue` | `string \| null` | *[context]* — captured before deletion |

> **Note**: The task is fetched in full before deletion to ensure context fields are available.

**Example payload:**
```json
{
  "taskId": 42,
  "assignee": "tko-sword",
  "owner": "tko-sword",
  "status": "complete",
  "cue": null
}
```

---

### 5.4 `task-archived`

Emitted when a task is archived (soft delete).

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the archived task |
| `task` | `ParsedTask` | Full task object (see [§6.1](#61-parsedtask)) |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

### 5.5 `task-status-changed`

Emitted when a task's status is explicitly changed.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task |
| `before` | `string` | Previous status (`"idle" \| "working" \| "complete"`) |
| `after` | `string` | New status (`"idle" \| "working" \| "complete"`) |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* — equals `after` |
| `cue` | `string \| null` | *[context]* |

**Example payload:**
```json
{
  "taskId": 42,
  "before": "idle",
  "after": "working",
  "assignee": "tko-sword",
  "owner": "tko-sword",
  "status": "working",
  "cue": "tko-sword"
}
```

---

### 5.6 `task-assigned`

Emitted when a task is assigned to an agent.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task |
| `before` | `string \| null` | Previous assignee (null if previously unassigned) |
| `after` | `string \| null` | New assignee (null if unassigned) |
| `assignee` | `string \| null` | *[context]* — equals `after` |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

### 5.7 `task-transferred`

Emitted when a task is transferred from one agent to another.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task |
| `from` | `string` | Agent the task is being transferred from |
| `to` | `string` | Agent the task is being transferred to |
| `comment` | `string` | Transfer comment/reason |
| `assignee` | `string \| null` | *[context]* — equals `to` |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

### 5.8 `task-signed-up`

Emitted when an agent self-assigns (signs up for) a task.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task |
| `agent` | `string` | Agent name that signed up |
| `assignee` | `string \| null` | *[context]* — equals `agent` |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

### 5.9 `task-queue-changed`

Emitted when a task is moved from one queue to another.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task |
| `before` | `string \| null` | Previous queue name (null if not in a queue) |
| `after` | `string \| null` | New queue name (null if removed from queue) |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* — equals `after` |

---

### 5.10 `task-added-to-queue`

Emitted when a task is added to a specific queue.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task |
| `queueName` | `string` | Name of the queue the task was added to |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* — equals `queueName` |

---

### 5.11 `task-removed-from-queue`

Emitted when a task is removed from a queue.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task |
| `queueName` | `string \| null` | Name of the queue the task was removed from |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* — null after removal |

---

### 5.12 `queue-cleared`

Emitted when an entire queue is cleared (all tasks removed).

> ⚠️ **This is the only event type that does NOT include TaskContext fields.**
> It is a queue-level event, not a task-level event.

| Field | Type | Description |
|---|---|---|
| `queueName` | `string` | Name of the queue that was cleared |
| `count` | `number` | Number of tasks that were in the queue |

**Example payload:**
```json
{
  "queueName": "tko-sword",
  "count": 5
}
```

---

### 5.13 `subtask-created`

Emitted when a subtask is created under a parent task.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the newly created subtask |
| `parentId` | `number` | ID of the parent task |
| `task` | `ParsedTask` | Full subtask object (see [§6.1](#61-parsedtask)) |
| `assignee` | `string \| null` | *[context]* — reflects the subtask's context |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

### 5.14 `subtask-moved`

Emitted when a subtask is moved to a different parent task.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the subtask being moved |
| `oldParentId` | `number \| null` | ID of the previous parent task (null if it was a root task) |
| `newParentId` | `number \| null` | ID of the new parent task (null if moved to root) |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

### 5.15 `comment-added`

Emitted when a comment is added to a task.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task the comment belongs to |
| `comment` | `CommentData` | Full comment object (see [§6.2](#62-commentdata)) |
| `assignee` | `string \| null` | *[context]* — looked up from the task at emit time |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

**Example payload:**
```json
{
  "taskId": 42,
  "comment": {
    "id": 7,
    "task_id": 42,
    "content": "Started working on this",
    "created_by": "tko-sword",
    "created_at": "2025-07-29T22:41:00.000Z",
    "updated_at": "2025-07-29T22:41:00.000Z"
  },
  "assignee": "tko-sword",
  "owner": "tko-sword",
  "status": "working",
  "cue": "tko-sword"
}
```

---

### 5.16 `comment-updated`

Emitted when a comment's content is edited.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task the comment belongs to |
| `commentId` | `number` | ID of the edited comment |
| `before` | `string` | Previous comment content |
| `after` | `string` | New comment content |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

### 5.17 `comment-deleted`

Emitted when a comment is deleted from a task.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task the comment belonged to |
| `commentId` | `number` | ID of the deleted comment |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

### 5.18 `link-added`

Emitted when a link is added to a task.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task the link belongs to |
| `link` | `LinkData` | Full link object (see [§6.3](#63-linkdata)) |
| `assignee` | `string \| null` | *[context]* — looked up from the task at emit time |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

**Example payload:**
```json
{
  "taskId": 42,
  "link": {
    "id": 3,
    "task_id": 42,
    "url": "https://github.com/ericroliver/tinytask-mcp/pull/12",
    "description": "Related PR",
    "created_by": "tko-sword",
    "created_at": "2025-07-29T22:41:00.000Z"
  },
  "assignee": "tko-sword",
  "owner": "tko-sword",
  "status": "working",
  "cue": "tko-sword"
}
```

---

### 5.19 `link-updated`

Emitted when a link's description or URL is edited.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task the link belongs to |
| `linkId` | `number` | ID of the edited link |
| `before` | `Partial<LinkData>` | Snapshot of changed fields before the update |
| `after` | `LinkData` | Full link object after the update (see [§6.3](#63-linkdata)) |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

### 5.20 `link-deleted`

Emitted when a link is deleted from a task.

| Field | Type | Description |
|---|---|---|
| `taskId` | `number` | ID of the task the link belonged to |
| `linkId` | `number` | ID of the deleted link |
| `assignee` | `string \| null` | *[context]* |
| `owner` | `string \| null` | *[context]* |
| `status` | `string` | *[context]* |
| `cue` | `string \| null` | *[context]* |

---

## 6. Referenced Data Types

### 6.1 `ParsedTask`

The full task object. Included in `task-created`, `task-updated` (as `after`), `task-archived`,
and `subtask-created` payloads.

| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | `number` | ❌ | Unique task ID |
| `title` | `string` | ❌ | Task title |
| `description` | `string` | ✅ | Task description |
| `status` | `string` | ❌ | `"idle" \| "working" \| "complete"` |
| `assigned_to` | `string` | ✅ | Agent currently assigned |
| `previous_assigned_to` | `string` | ✅ | Previous assignee (before last assignment) |
| `created_by` | `string` | ✅ | Agent that created the task |
| `priority` | `number` | ❌ | Priority level (higher = more important) |
| `tags` | `string[]` | ❌ | List of tag labels |
| `parent_task_id` | `number` | ✅ | Parent task ID (null for root tasks) |
| `queue_name` | `string` | ✅ | Queue/cue the task belongs to |
| `blocked_by_task_id` | `number` | ✅ | ID of a task blocking this one |
| `is_currently_blocked` | `boolean` | ❌ | Whether the task is currently blocked |
| `created_at` | `string` | ❌ | ISO 8601 timestamp |
| `updated_at` | `string` | ❌ | ISO 8601 timestamp |
| `archived_at` | `string` | ✅ | ISO 8601 timestamp if archived, null otherwise |

### 6.2 `CommentData`

Included in `comment-added` payloads.

| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | `number` | ❌ | Unique comment ID |
| `task_id` | `number` | ❌ | ID of the task this comment belongs to |
| `content` | `string` | ❌ | Comment text content |
| `created_by` | `string` | ✅ | Agent that created the comment |
| `created_at` | `string` | ❌ | ISO 8601 timestamp |
| `updated_at` | `string` | ❌ | ISO 8601 timestamp |

### 6.3 `LinkData`

Included in `link-added` and `link-updated` (as `after`) payloads.

| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | `number` | ❌ | Unique link ID |
| `task_id` | `number` | ❌ | ID of the task this link belongs to |
| `url` | `string` | ❌ | The URL |
| `description` | `string` | ✅ | Optional description of the link |
| `created_by` | `string` | ✅ | Agent that created the link |
| `created_at` | `string` | ❌ | ISO 8601 timestamp |

---

## 7. Service → Event Emission Map

Which service emits which events:

| Service | Event Types Emitted |
|---|---|
| **TaskService** | `task-created`, `task-updated`, `task-deleted`, `task-archived`, `task-status-changed`, `task-assigned`, `task-transferred`, `task-signed-up`, `subtask-created`, `subtask-moved` |
| **QueueService** | `task-queue-changed`, `task-added-to-queue`, `task-removed-from-queue`, `queue-cleared` |
| **CommentService** | `comment-added`, `comment-updated`, `comment-deleted` |
| **LinkService** | `link-added`, `link-updated`, `link-deleted` |

---

## 8. Task Context Lookup Strategy

Different services use different strategies to populate the four core context fields:

| Service | Strategy |
|---|---|
| **TaskService** | `extractTaskContext(task_obj)` — uses the in-memory `ParsedTask` object already available from the operation |
| **QueueService** | `extractTaskContext(task_obj)` — uses the in-memory `ParsedTask` object already available |
| **CommentService** | `getTaskContext(taskId)` — performs a database lookup (`SELECT * FROM tasks WHERE id = ?`) to fetch context, since the comment operation doesn't have the full task object |
| **LinkService** | `getTaskContext(taskId)` — same DB lookup strategy as CommentService |

> If a task is not found during the DB lookup (e.g. already deleted), the context fields are
> omitted entirely (spread of `undefined` → no keys added). The payload will still be valid,
> just without context fields.

---

## 9. Dashboard Integration Notes

### Filtering by Task Status
Use the `status` context field to filter:
- `"idle"` — tasks waiting to be picked up
- `"working"` — tasks currently in progress
- `"complete"` — tasks that are finished

### Filtering by Agent
- `assignee` — who is currently working on the task
- `owner` — who created the task

### Filtering by Queue
- `cue` — which queue the task is in (e.g. `"tko-sword"`, `"dtai-sword"`, `"ready-for-qa"`)

### Events That Change State
Events that modify the core context fields:
- `task-status-changed` — changes `status`
- `task-assigned` / `task-signed-up` / `task-transferred` — changes `assignee`
- `task-queue-changed` / `task-added-to-queue` / `task-removed-from-queue` — changes `cue`

### Special Event: `queue-cleared`
This event does not include task context. It is a bulk operation that clears an entire queue.
The `count` field indicates how many tasks were affected. A dashboard should treat this as a
signal to remove or update all tasks in the specified queue.

### `task-deleted` Context
The context fields in `task-deleted` are captured **before** the deletion occurs, so they
reflect the last known state of the task. This allows a dashboard to show a final "deleted"
notification with the task's last assignee, owner, status, and queue.

---

## 10. Source Files

| File | Purpose |
|---|---|
| `src/events/event-types.ts` | All event types, payload interfaces, `TaskContext`, `extractTaskContext()`, `createEvent()` |
| `src/events/event-bus.ts` | In-process event bus that decouples event generation from broadcasting |
| `src/events/signalr-broadcaster.ts` | SignalR client that connects to the hub, joins group, rate-limits, and sends events |
| `src/services/task-service.ts` | Emits task lifecycle, assignment, status, and subtask events |
| `src/services/queue-service.ts` | Emits queue operation events |
| `src/services/comment-service.ts` | Emits comment events (uses DB lookup for context) |
| `src/services/link-service.ts` | Emits link events (uses DB lookup for context) |
