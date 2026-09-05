# TinyTask Process Manual — Foundation

> **Status:** Official / Definitive
> **Audience:** All TinyTask agents and operators
> **Purpose:** Establish the canonical reference for task creation, lifecycle, and flow within the TinyTask (TKO) task management system.

---

## 1. Introduction

TinyTask (TKO) is a minimal task management system designed for LLM agent collaboration. It is exposed as a Model Context Protocol (MCP) server, an HTTP API, and a CLI. This manual is the definitive reference for how tasks should be created, routed, tracked, and completed across all agent roles.

### How This Manual Is Structured

| Document | Scope |
|---|---|
| **Foundation** (this document) | Core concepts, data model, roles, queues, lifecycle, and global rules |
| **Scenario Group A: Core Task Lifecycle** | Standard creation, assignment, status changes, completion |
| **Scenario Group B: Development Workflows** | Feature development, subtask decomposition, parallel work |
| **Scenario Group C: QA & Bug Workflows** | Bug reporting, fix cycles, verification, kickbacks |
| **Scenario Group D: Task Organization & Dependencies** | Blocking, linking, archiving, reorganization |
| **Scenario Group E: Collaboration & Communication** | Comments, cross-queue handoffs, coordination |
| **CLI Command Reference** | Full CLI syntax and examples |
| **[Conventions & Best Practices](./07-Conventions-and-Best-Practices.md)** | Naming, tagging, prioritization, and operational norms |

---

## 2. Core Concepts

### 2.1 Task

A **task** is the fundamental unit of work in TinyTask. Every actionable item — a feature, a bug, a research question, a configuration change — is represented as a task.

Tasks carry:

- A **title** and **description**
- A **status** (`idle`, `working`, `complete`)
- An **assignee** (`assigned_to`) and **creator** (`created_by`)
- A **queue** (`queue_name`) that determines which agent picks it up
- A **priority** (`low`, `medium`, `high`, `urgent`)
- **Tags** (JSON array) for categorization
- Optional **parent task** for subtask relationships
- Optional **blocked-by** reference to another task
- **Timestamps** for creation, updates, and completion
- An **archived_at** field (nullable) for soft-deletion

### 2.2 Subtask

A **subtask** is a task with a `parent_task_id` set. Subtasks allow complex work to be decomposed into smaller, independently tracked pieces. The parent task remains the umbrella; subtasks roll up under it.

Key rules:
- A subtask is a full task — it has its own status, queue, assignee, and lifecycle.
- Subtasks **do not** automatically change the parent's status.
- An agent should use subtasks when a single task is too large to complete in one focused unit of work.

### 2.3 Queue

A **queue** is a named collection of tasks. Queues are the routing mechanism — they determine which agent (or agent role) is responsible for picking up the task.

Standard queues:

| Queue | Purpose |
|---|---|
| `ready-for-development` | Tasks assigned to a developer for implementation |
| `ready-for-testing` | Tasks that have been fixed/implemented and need QA verification |
| `ready-for-qa` | Tasks completed by a developer, ready for final QA review |

Custom queues can be created as needed (e.g., `triage`, `blocked`, `research`).

### 2.4 Comment

A **comment** is an annotation attached to a task. Comments are the primary mechanism for inter-agent communication within the task system. They carry an `author`, `body` text, and a timestamp.

Use comments to:
- Provide context or instructions
- Report progress updates
- Ask clarifying questions
- Document decisions

### 2.5 Link

A **link** is a typed relationship between two tasks. Links enable agents to express dependencies, duplicates, or other cross-task relationships.

Link types include:
- `blocks` — Task A blocks Task B
- `related` — Tasks are related but not blocking
- `duplicate` — Tasks describe the same work

### 2.6 Task History

Every task has an immutable **history** log. Each change to a task (status change, queue move, reassignment, field update) is recorded as a history entry with the old value, new value, timestamp, and the agent who made the change. This provides full auditability.

---

## 3. Agent Roles

### 3.1 Developer (`tko-sword`)

| Aspect | Detail |
|---|---|
| **Queue name** | `tko-sword` |
| **Primary responsibility** | Implement features, fix bugs, write code |
| **Picks up from** | `ready-for-development` |
| **Status discipline** | Marks tasks `working` when starting, `idle` when done (never `complete`) |
| **On completion** | Moves tasks to `ready-for-qa` |
| **On defect fix** | Reassigns to the task creator (e.g., `tko-shield`), moves to `ready-for-testing` |

### 3.2 Tester (`tko-shield`)

| Aspect | Detail |
|---|---|
| **Queue name** | `tko-shield` |
| **Primary responsibility** | Test API/MCP endpoints, file bug reports, verify fixes |
| **Picks up from** | `ready-for-testing` (verification), own queue for bug filing |
| **Status discipline** | Can mark tasks `complete` after verification |
| **On bug found** | Files a new task (type: defect), assigns to `tko-sword`, moves to `ready-for-development` |
| **On fix verified** | Closes the ticket, cleans up test comments |

### 3.3 General Agent Rules (All Roles)

- Use the `task-management` skill for all task operations.
- Never mark a task `complete` unless your role explicitly permits it.
- Always provide a comment when changing status, queue, or assignee.
- Check the task history before starting work to understand prior context.
- Do not work on tasks assigned to another agent without coordination.

---

## 4. Task Fields Reference

### 4.1 Core Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | integer (auto) | Yes | Unique task identifier (sequential integer, e.g. `892`) |
| `title` | string | Yes | Short summary of the work |
| `description` | string | Yes | Detailed description of the task |
| `status` | enum | Yes | `idle`, `working`, or `complete` |
| `assigned_to` | string | No | Agent name responsible for the task |
| `created_by` | string | Yes | Agent name that created the task |
| `priority` | enum | No | `low`, `medium`, `high`, `urgent` (default: `medium`) |
| `tags` | JSON array | No | Categorization labels (e.g., `["bug", "api"]`) |
| `queue_name` | string | No | Queue the task belongs to |
| `parent_task_id` | string | No | Parent task if this is a subtask |
| `blocked_by_task_id` | string | No | Task ID that blocks this task |

### 4.2 Timestamps

| Field | Type | Description |
|---|---|---|
| `created_at` | ISO 8601 | When the task was created |
| `updated_at` | ISO 8601 | Last modification time |
| `completed_at` | ISO 8601 | When the task was marked complete (nullable) |
| `archived_at` | ISO 8601 | When the task was archived (nullable) |

### 4.3 Status Values

| Status | Meaning | Who Can Set |
|---|---|---|
| `idle` | Task is not being actively worked; waiting for pickup or handoff | Any agent |
| `working` | Task is being actively worked on by the assignee | Assignee |
| `complete` | Task is finished and verified | Tester / QA role |

### 4.4 Priority Levels

| Priority | Meaning |
|---|---|
| `low` | Non-urgent, can wait |
| `medium` | Normal priority (default) |
| `high` | Should be addressed soon |
| `urgent` | Blocks other work; address immediately |

---

## 5. Task Lifecycle Overview

```
                    ┌─────────┐
     Create ──────▶ │  idle   │
                    └────┬────┘
                         │ assign + start
                         ▼
                    ┌──────────┐
                    │ working  │
                    └────┬─────┘
                         │ done (developer) → move to ready-for-qa
                         │                   set status back to idle
                         ▼
                    ┌──────────┐
                    │  idle    │ (in ready-for-qa queue)
                    └────┬─────┘
                         │ QA verifies
                         ▼
                    ┌──────────┐
                    │ complete │
                    └──────────┘
```

### Key Lifecycle Rules

1. **Creation**: A task is created with status `idle`, assigned to a queue and agent.
2. **Pickup**: The assignee sets status to `working` and begins work.
3. **Handoff**: When the developer finishes, they set status back to `idle` and move the task to the appropriate handoff queue (`ready-for-qa` or `ready-for-testing`).
4. **Verification**: The tester picks up the task, verifies the work, and either marks it `complete` or kicks it back.
5. **Kickback**: If verification fails, the tester reassigns to the developer, moves to `ready-for-development`, and adds a comment explaining the issue.
6. **Archival**: Completed tasks can be archived (soft-deleted) when no longer needed for reference.

---

## 6. Queue Transition Rules

| From Queue | To Queue | Trigger | Who |
|---|---|---|---|
| (new) | `ready-for-development` | Task created for dev work | Any agent |
| `ready-for-development` | `ready-for-qa` | Developer completes work | Developer |
| `ready-for-development` | `ready-for-testing` | Defect fixed, needs verification | Developer |
| `ready-for-testing` | `ready-for-development` | QA finds issue, kicks back | Tester |
| `ready-for-qa` | (complete) | QA verifies and closes | Tester |
| Any | `blocked` | Task is blocked by another | Any agent |

### Rules
- Always add a **comment** when moving a task between queues explaining the reason.
- Always update the **assignee** to match the role responsible for the destination queue.
- Never leave a task in `working` status when moving it to another queue — set it to `idle` first.

---

## 7. Global Conventions

### 7.1 Task Titles
- Start with an action verb (e.g., "Implement…", "Fix…", "Investigate…").
- Keep under 80 characters.
- Be specific enough to distinguish from other tasks.

### 7.2 Tags
- Use lowercase, hyphenated tags (e.g., `api`, `mcp`, `cli`, `database`).
- Tag by component or concern, not by status.

### 7.3 Comments
- Always comment on status changes, queue moves, and reassignments.
- Use clear, concise language.
- Reference other task IDs when relevant (e.g., "See #20260724_01 for related issue").

### 7.4 Subtasks
- Create subtasks only when a task genuinely needs decomposition.
- Each subtask should be independently completable.
- The parent task should not be marked complete until all subtasks are complete.

### 7.5 Dependencies
- Use `blocked_by_task_id` for direct blocking relationships.
- Use links (`blocks`, `related`, `duplicate`) for cross-task relationships that don't fit the single-field model.
- Always comment when creating a dependency to explain why.

---

## 8. Next Steps

This foundation document defines the shared vocabulary and rules. The following scenario documents provide step-by-step processes for specific situations. Refer to the **CLI Command Reference** for exact command syntax for any operation described here.

---

*This document is part of the TinyTask Process Manual. For scenario-specific guidance, see the companion documents in this directory.*
