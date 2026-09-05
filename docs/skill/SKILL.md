---
name: task-management
description: TinyTask CLI reference — commands, data model, conventions, and rules for all agents.
---

> **Agent names (e.g., `tko-sword`, `tko-shield`) are examples.** Use actual names from your environment — defined in your `AGENTS.md` file. Replace placeholders like `<your-agent>`, `<qa-agent>`, `<developer>` with real names.

# TinyTask Shared Skill

## Overview

TinyTask is a task management system for LLM agent collaboration, exposed as an MCP server, HTTP API, and CLI. The `tinytask` CLI communicates with the server over HTTP. Role-specific workflows live in `developer.md`, `tester.md`, `reviewer.md`, and `coordinator.md` — this file is the CLI syntax and conventions reference.

## Core Concepts

| Concept | Description |
|---|---|
| Task | Fundamental unit of work — has title, description, status, assignee, queue, priority, tags, optional parent and blocked-by |
| Subtask | Task with `parent_task_id` set — full task with own lifecycle; does not auto-change parent status |
| Queue | Named collection of tasks — routing mechanism determining which agent picks up work |
| Comment | Annotation attached to a task — primary inter-agent communication channel |
| Link | Typed URL-based relationship between tasks or external resources (PRs, docs) |
| History | Immutable log of every task change (status, queue, assignee, fields) with timestamp and agent |

## Task Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | integer (auto) | Yes | Unique ID (sequential integer, e.g. `892`) |
| `title` | string | Yes | Short summary, <80 chars, action verb prefix |
| `description` | string | Yes | What, why, acceptance criteria |
| `status` | enum | Yes | `idle` \| `working` \| `complete` |
| `assigned_to` | string | No | Agent responsible for the task |
| `created_by` | string | Yes | Agent that created the task |
| `priority` | enum | No | `low` \| `medium` \| `high` \| `urgent` (default: `medium`) |
| `tags` | JSON array | No | Lowercase, hyphenated labels |
| `queue_name` | string | No | Queue the task belongs to |
| `parent_task_id` | string | No | Parent task if subtask |
| `blocked_by_task_id` | string | No | Task ID that blocks this task |
| `created_at` | ISO 8601 | Yes | Creation timestamp |
| `updated_at` | ISO 8601 | Yes | Last modification time |
| `completed_at` | ISO 8601 | No | When marked complete (nullable) |
| `archived_at` | ISO 8601 | No | When archived (nullable) |

## Status Values

| Status | Meaning | Who Can Set |
|---|---|---|
| `idle` | Not actively worked; waiting for pickup or handoff | Any agent |
| `working` | Actively being worked on | Assignee only |
| `complete` | Finished and verified | Tester / QA role only |

## Priority Levels

| Priority | Numeric | When to Use |
|---|---|---|
| `low` | 1–3 | Non-urgent — docs polish, minor refactors, cosmetic fixes |
| `medium` | 4–6 | Normal (default) — most features and non-critical bugs |
| `high` | 7–8 | Address soon — bugs affecting users, features blocking other work |
| `urgent` | 9–10 | Blocks other work or affects production — address immediately |

## Standard Queues

| Queue | Purpose | Responsible Role |
|---|---|---|
| `ready-for-development` | Tasks for developer implementation | Developer |
| `ready-for-testing` | Defect fixes needing re-verification by reporter | Tester |
| `ready-for-qa` | Feature work completed, ready for final QA | Tester |
| `ready-for-code-review` | Implementation ready for developer-to-developer review | Reviewing developer |
| `blocked` | Tasks waiting on a dependency | Any (monitored by coordinator) |
| `triage` | Tasks being evaluated for routing | Coordinator / lead |
| `backlog` | Tasks not yet scheduled | Any |

## Queue Transition Rules

| From | To | Trigger | Who |
|---|---|---|---|
| (new) | `ready-for-development` | Task created for dev work | Any agent |
| `ready-for-development` | `ready-for-qa` | Developer completes feature | Developer |
| `ready-for-development` | `ready-for-testing` | Developer fixes defect | Developer |
| `ready-for-development` | `ready-for-code-review` | Developer requests review | Developer |
| `ready-for-testing` | `ready-for-development` | QA finds issue, kicks back | Tester |
| `ready-for-code-review` | `ready-for-development` | Reviewer requests changes | Reviewer |
| `ready-for-code-review` | `ready-for-qa` | Reviewer approves | Reviewer |
| `ready-for-qa` | (complete) | QA verifies and closes | Tester |
| Any | `blocked` | Task blocked by dependency | Any agent |
| `blocked` | `ready-for-development` | Dependency resolved | Any agent |

**Rules:** Always comment when moving queues. Always update assignee to match destination role. Never leave `working` when moving to another queue — set `idle` first.

## CLI Setup

```bash
tinytask config init                              # First-time setup → ~/.tinytaskrc.json
tinytask config set url http://localhost:3000/mcp # Server URL
```

**Agent identity:** Set the `TKO_AGENT` environment variable in your agent process. This is used as `created_by` for tasks, comments, and links. Alternatively, pass `--created-by <agent>` per command, or `tinytask config set agent <your-agent>`.

### Global Options

| Option | Description |
|---|---|
| `--url <url>` | Override server URL for this invocation |
| `--json` | Output as JSON (shorthand for `--output json`) |
| `--no-color` | Disable colored output |
| `--profile <name>` | Use a specific config profile |

| Variable | Description |
|---|---|
| `TKO_AGENT` | Agent identity — used for `created_by` on tasks, comments, links; `--from` on move; `--agent` on signup/queue view (preferred) |
| `TINYTASK_AGENT` | Legacy alias for `TKO_AGENT` (backward compat) |
| `TINYTASK_URL` | Server URL |
| `TINYTASK_FORMAT` | Output format (`table`, `json`, `csv`, `compact`) |
| `TINYTASK_NO_COLOR` | Set `true` to disable color |
| `TINYTASK_TIMEOUT` | Request timeout (ms) |

Precedence: CLI flags > environment variables > active profile > base config > defaults.

> **Note:** `assigned_to` has no default — tasks are unassigned unless you specify `-a <agent>` or assign via queue. Agent identity (`TKO_AGENT` or `--created-by`) is required for task creation.

## Task Commands

`tinytask task` (alias: `tinytask t`)

```bash
# Create
tinytask task create "<title>" [-d <desc>] [-a <agent>] [-c <creator>] [-p <priority>] [-t <tags>] [--parent <id>] [-q <queue>]
# created_by is required — set TKO_AGENT env var or pass -c <creator>. assigned_to defaults to unassigned.

# Get / Update / List / Archive / Delete
tinytask task get <id> [--json]
tinytask task update <id> [-t <title>] [-d <desc>] [-s <status>] [-a <agent>] [-p <priority>] [--tags <tags>] [--parent <id|null>] [-q <queue>]
tinytask task list [-a <agent>] [-s <status>] [-q <queue>] [--parent <id>] [--exclude-subtasks] [--include-archived] [--limit <n>] [--offset <n>]
tinytask task archive <id>
tinytask task delete <id> [-y]
```

```bash
# Examples
tinytask task create "Implement pagination" -d "Add limit/offset to GET /tasks" -a <developer> -p 7 --tags "api,performance" -q ready-for-development
tinytask task create "BUG: Login 500 on special chars" -d "<steps>" -a <developer> -p 9 --tags "bug,auth" -q ready-for-development
tinytask task update 5 --status working
tinytask task update 5 --status idle --queue ready-for-qa --assigned-to <qa-agent>
tinytask task update 10 --parent null          # Make subtask top-level
```

## Subtask Commands

`tinytask subtask` (alias: `tinytask st`)

```bash
tinytask subtask create <parent-id> "<title>" [-d <desc>] [-a <agent>] [-p <priority>] [-t <tags>] [-q <queue>]
tinytask subtask list <parent-id> [-r] [--include-archived]
tinytask subtask tree <task-id> [-r]
tinytask subtask move <subtask-id> [new-parent-id]    # Omit new parent to make top-level
```

## Queue Commands

`tinytask queue` (alias: `tinytask q`)

```bash
tinytask queue view [agent] [-s <status>] [--mine]   # View agent's queue (use --mine for your own)
tinytask queue list                                  # List all queue names
tinytask queue stats <queue-name>                    # Task counts, assignment breakdown, agents
tinytask queue tasks <queue-name> [-s <status>] [-a <agent>] [--exclude-subtasks] [--include-archived] [-l <limit>] [-o <offset>]
tinytask queue add <task-id> <queue-name>            # Add task to queue
tinytask queue remove <task-id>                      # Remove from queue (task stays in system)
tinytask queue move <task-id> <new-queue>            # Move between queues
tinytask queue clear <queue-name> [-y]               # Remove all tasks from queue
```

## Agent Workflow Commands

```bash
tinytask signup [-a <agent>]                          # Claim next idle task → sets working
tinytask move <id> <to-agent> [-f <from-agent>] [-m <comment>]  # Transfer task between agents (auto-adds comment)
```

## Comment Commands

`tinytask comment` (alias: `tinytask c`)

```bash
tinytask comment add <task-id> "<content>" [--created-by <agent>]
tinytask comment list <task-id>
tinytask comment update <comment-id> "<content>"
tinytask comment delete <comment-id> [-y]
```

## Link Commands

`tinytask link` (alias: `tinytask l`)

```bash
tinytask link add <task-id> <url> [-d <description>] [--created-by <agent>]
tinytask link list <task-id>
tinytask link update <link-id> [--url <url>] [--description <text>]
tinytask link delete <link-id> [-y]
```

Link type prefixes (convention — in description field): `[blocks]`, `[related]`, `[duplicate]`, or none for general reference (PRs, docs). Link both directions when connecting two TinyTask tasks.

## Config Commands

```bash
tinytask config init [-f]                 # Create ~/.tinytaskrc.json (--force to overwrite)
tinytask config show                      # Display current config
tinytask config set <key> <value>         # Set: url, agent, outputFormat, colorOutput, timeout
tinytask config get <key>                 # Get value
tinytask config profile add -n <name> -u <url> [--agent <agent>]
tinytask config profile list
tinytask config profile use <name>
tinytask config profile remove <name>
```

## Output Formats

| Format | Use | How |
|---|---|---|
| `table` (default) | Interactive, human reading | Default — no action |
| `json` | Scripting, piping to `jq` | `--json` flag |
| `csv` | Spreadsheet export | `config set outputFormat csv` or `TINYTASK_FORMAT=csv` |
| `compact` | Quick scans, minimal output | `config set outputFormat compact` or `TINYTASK_FORMAT=compact` |
| `tree` | Subtask hierarchy | `subtask tree <id> [-r]` (automatic) |

`csv` and `compact` are config/env-only — no CLI flags. Use `--json` for one-off scripting.

## Global Conventions

### Naming

| Rule | Example |
|---|---|
| Start with action verb | "Implement pagination on task list endpoint" |
| Be specific — include component/feature | "Fix URL encoding in login password handler" |
| Under 80 characters | — |
| No status, assignee, or ID in title | Use fields, not title text |

Prefixes: `BUG:` (defects), `DECISION:` (escalations), `Follow-up:` (deferred work). No prefix for features.

### Tags

- Lowercase, hyphenated, singular: `api`, `mcp`, `cli`, `rate-limiting`
- Tag by component/concern — never by status or agent name
- 2–4 tags typical; always tag bugs with `bug` plus affected component
- Standard tags: `api`, `mcp`, `cli`, `database`, `auth`, `bug`, `regression`, `testing`, `documentation`, `config`, `security`, `performance`, `refactor`, `decision`, `enhancement`

### Comments

Comment on **every** status change, queue move, reassignment, dependency action, and verification result. Be specific — include task IDs, file names, line numbers, branch/commit references. Reference related tasks by ID ("See #20260724_05").

### Comment Templates

| Type | Template |
|---|---|
| Start | `Started. <approach>. Branch: <branch>.` |
| Pause | `Pausing for <reason>. Progress: <X%>. Remaining: <list>. Branch: <branch>. Commit: <hash>.` |
| Completion | `Implementation complete. <what, how tested, QA focus>. Branch: <branch>. PR: #<n>.` |
| Fix summary | `Fix complete. Root cause: <cause>. Changes: <list>. Tests: <details>. Branch: <branch>. Commit: <hash>.` |
| Verification pass | `Verified. <what tested, edge cases, regression check>. Closing.` |
| Verification fail | `Verification FAILED. <what didn't work>. Steps: <n>. Expected: <x>. Actual: <y>.` |

### Queue Discipline

- Always comment when moving between queues.
- Always update assignee to match destination queue's role.
- Never leave `working` when moving to another queue — set `idle` first.
- Use `ready-for-testing` for defect fixes, `ready-for-qa` for feature completions.
- Use `blocked` queue for tasks waiting on dependencies — don't leave them in active queues.
- Check your queue at session start: `tinytask queue view --mine`

### Dependencies

- `blocked_by_task_id` for true hard dependencies (set via MCP/REST — CLI doesn't expose it).
- Always comment explaining the dependency and notify the blocking task's assignee.
- Move blocked tasks to `blocked` queue. When blocker completes, manually move unblocked tasks back.
- Links for non-blocking relationships (`[related]`, `[duplicate]`), not `blocked_by`.

## Golden Rules

1. **Developers never mark `complete`.** Only testers/QA after verification.
2. **Always set `idle` before moving queues.** A `working` task in a handoff queue is ambiguous.
3. **Always comment on status, queue, and assignee changes.** No silent changes.
4. **Check task history before starting work.** Understand prior context.
5. **Don't work on others' tasks without coordination.** Communicate via comments first.
6. **Set `working` when starting, `idle` when pausing.** Don't leave false signals.
7. **Don't run the app from CLI.** Causes hanging processes — notify developer for manual testing.
8. **Halt before architectural decisions.** Document options, seek approval — don't decide autonomously.

## Common Mistakes

| Mistake | Impact | Prevention |
|---|---|---|
| Vague title | Can't distinguish in queue views | Action verb + specific subject, <80 chars |
| Missing description | Assignee lacks context | Include what, why, acceptance criteria |
| Developer marks `complete` | QA never verified | Only testers mark `complete` |
| `working` during handoff | Ambiguous state | Set `idle` before moving queues |
| No start comment | No audit trail | Always comment when starting |
| No completion comment | QA doesn't know what to test | Document what was done, how tested |
| Vague comments | No actionable info | Include IDs, files, line numbers |
| Blocked tasks in active queues | Queue clutter | Move to `blocked` queue |
| No comment on dependency | "What" clear, "why" unknown | Always explain reasoning |
| Not resuming unblocked tasks | Unblocked tasks sit idle | Manually detect and move back |
| `ready-for-qa` vs `ready-for-testing` confusion | Wrong verifier picks up | `ready-for-testing` for defects, `ready-for-qa` for features |
| Not reassigning defect to creator | Reporter doesn't see the fix | Reassign to `created_by` |
| Kickback without details | Developer can't reproduce | Include exact steps, expected vs. actual |
| Infinite kickback loop | Defect never resolves | Escalate after 3 cycles |
| Using `any` in production | Lint warnings, type safety loss | Use `unknown` or specific types |
| Removing failing tests | Coverage degrades | Fix the test, don't remove it |
| Running app from CLI | Hanging processes | Let developer handle runtime testing |
| Filing bug without reproducing | May not be real | Reproduce first; note if intermittent |
| Missing tags | Filtering breaks | Tag with component/concern at creation |
