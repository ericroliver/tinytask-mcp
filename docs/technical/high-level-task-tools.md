# High-Level Task Tools - Technical Design

## Overview

This document describes two high-level task tools designed to minimize token spend by combining multiple operations into single atomic transactions. These tools reduce the number of round-trips agents need to make when performing common task management workflows.

## Background

### Problem Statement
Agents currently need multiple tool calls to perform common workflows:
1. **Signing up for a task**: List queue → Get first task → Update task status to 'working'
2. **Transferring a task**: Update task assignment → Update task status → Add handoff comment

Each tool call consumes tokens and requires waiting for responses. By combining these operations into single atomic tools, we can significantly reduce token spend and improve agent efficiency.

### Design Principles
- **Atomicity**: All operations within a tool execute in a single database transaction
- **Safety**: Validate all preconditions before making changes
- **Clarity**: Return comprehensive information about the operation result
- **Consistency**: Follow existing code patterns and architecture

## Tool Specifications

### 1. signup_for_task

**Purpose**: Allows an agent to atomically claim the highest priority idle task from their queue.

#### Input Parameters
```typescript
{
  agent_name: string  // Name of the agent signing up for a task
}
```

#### Behavior
1. Query the agent's queue for tasks with:
   - `assigned_to = agent_name`
   - `status = 'idle'` (exclude already working tasks)
   - `archived_at IS NULL`
   - Ordered by `priority DESC, created_at ASC` (higher priority numbers first, then oldest)
2. If no idle tasks found, return appropriate message
3. Select the first task from the queue
4. Update task status to `'working'`
5. Return the complete task with comments and links

**Note on Priority:** Higher priority numbers are more important. A task with priority 10 will be claimed before a task with priority 5.

#### Return Value
**Success case:**
```json
{
  "content": [{
    "type": "text",
    "text": "Task #123 claimed and set to working status\n\n{task_json_with_relations}"
  }]
}
```

**No tasks available case:**
```json
{
  "content": [{
    "type": "text",
    "text": "No idle tasks available in queue for agent: {agent_name}"
  }]
}
```

**Error case:**
```json
{
  "content": [{
    "type": "text",
    "text": "Error signing up for task: {error_message}"
  }],
  "isError": true
}
```

#### Transaction Flow
```
BEGIN TRANSACTION
  1. SELECT tasks WHERE assigned_to = ? AND status = 'idle' AND archived_at IS NULL
     ORDER BY priority DESC, created_at ASC LIMIT 1
  2. IF no task found: ROLLBACK, return "no tasks" message
  3. UPDATE tasks SET status = 'working', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  4. SELECT task with comments and links
COMMIT TRANSACTION
```

#### Service Layer Method
```typescript
signupForTask(agentName: string): TaskWithRelations | null
```

### 2. move_task

**Purpose**: Allows an agent to atomically transfer a task to another agent with a handoff comment.

#### Input Parameters
```typescript
{
  task_id: number,        // ID of task to transfer
  current_agent: string,  // Current agent (for verification)
  new_agent: string,      // Agent to transfer to
  comment: string         // Handoff message/context
}
```

#### Behavior
1. Verify task exists and is assigned to `current_agent`
2. Verify task status is `'working'`
3. Update task:
   - `assigned_to = new_agent`
   - `status = 'idle'` (ready for new agent to pick up)
   - `updated_at = CURRENT_TIMESTAMP`
4. Add comment with handoff message from `current_agent`
5. Return the updated task with comments and links

#### Return Value
**Success case:**
```json
{
  "content": [{
    "type": "text",
    "text": "Task #123 transferred from {current_agent} to {new_agent}\n\n{task_json_with_relations}"
  }]
}
```

**Validation error cases:**
```json
{
  "content": [{
    "type": "text",
    "text": "Task not found: {task_id}"
  }],
  "isError": true
}
```

```json
{
  "content": [{
    "type": "text",
    "text": "Task {task_id} is not assigned to {current_agent}"
  }],
  "isError": true
}
```

```json
{
  "content": [{
    "type": "text",
    "text": "Task {task_id} is complete and cannot be transferred"
  }],
  "isError": true
}
```

#### Transaction Flow
```
BEGIN TRANSACTION
  1. SELECT task WHERE id = ?
  2. IF not found: ROLLBACK, return error
  3. IF assigned_to != current_agent: ROLLBACK, return error
  4. IF status = 'complete': ROLLBACK, return error
  5. UPDATE tasks SET assigned_to = ?, status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  6. INSERT INTO comments (task_id, content, created_by) VALUES (?, ?, ?)
  7. SELECT task with comments and links
COMMIT TRANSACTION
```

#### Service Layer Method
```typescript
moveTask(
  taskId: number,
  currentAgent: string,
  newAgent: string,
  comment: string
): TaskWithRelations
```

## Implementation Plan

### 1. Service Layer (src/services/task-service.ts)

Add two new methods to the `TaskService` class:

```typescript
/**
 * Sign up for the highest priority idle task in agent's queue
 * Atomically marks the task as 'working' and returns it
 */
signupForTask(agentName: string): TaskWithRelations | null {
  return this.db.transaction(() => {
    // Get first idle task from agent's queue
    const task = this.db.queryOne<Task>(
      `SELECT * FROM tasks 
       WHERE assigned_to = ? 
         AND status = 'idle'
         AND archived_at IS NULL
       ORDER BY priority DESC, created_at ASC
       LIMIT 1`,
      [agentName]
    );

    if (!task) {
      return null;
    }

    // Update task to working status
    this.db.execute(
      'UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['working', task.id]
    );

    // Return task with relations
    const updatedTask = this.get(task.id, true);
    if (!updatedTask) {
      throw new Error('Failed to retrieve updated task');
    }

    return updatedTask;
  });
}

/**
 * Transfer task from current agent to new agent
 * Atomically updates assignment, status, and adds handoff comment
 */
moveTask(
  taskId: number,
  currentAgent: string,
  newAgent: string,
  comment: string
): TaskWithRelations {
  return this.db.transaction(() => {
    // Verify task and ownership
    const task = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.assigned_to !== currentAgent) {
      throw new Error(
        `Task ${taskId} is not assigned to ${currentAgent} (currently assigned to: ${task.assigned_to || 'no one'})`
      );
    }

    if (task.status !== 'working') {
      throw new Error(
        `Task ${taskId} is not in working status (current status: ${task.status})`
      );
    }

    // Update task assignment and status
    this.db.execute(
      `UPDATE tasks 
       SET assigned_to = ?, status = 'idle', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [newAgent, taskId]
    );

    // Add handoff comment
    this.db.execute(
      'INSERT INTO comments (task_id, content, created_by) VALUES (?, ?, ?)',
      [taskId, comment.trim(), currentAgent]
    );

    // Return updated task with relations
    const updatedTask = this.get(taskId, true);
    if (!updatedTask) {
      throw new Error('Failed to retrieve updated task');
    }

    return updatedTask;
  });
}
```

### 2. Tool Handlers (src/tools/task-tools.ts)

Add two new handler functions:

```typescript
export async function signupForTaskHandler(
  taskService: TaskService,
  params: { agent_name: string }
) {
  try {
    const task = taskService.signupForTask(params.agent_name);
    
    if (!task) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No idle tasks available in queue for agent: ${params.agent_name}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task #${task.id} claimed and set to working status\n\n${JSON.stringify(task, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error signing up for task: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function moveTaskHandler(
  taskService: TaskService,
  params: {
    task_id: number;
    current_agent: string;
    new_agent: string;
    comment: string;
  }
) {
  try {
    const task = taskService.moveTask(
      params.task_id,
      params.current_agent,
      params.new_agent,
      params.comment
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task #${params.task_id} transferred from ${params.current_agent} to ${params.new_agent}\n\n${JSON.stringify(task, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error moving task: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

### 3. Tool Definitions (src/tools/tool-definitions.ts)

Add Zod schemas:

```typescript
signup_for_task: z.object({
  agent_name: z.string().describe('Agent name signing up for task'),
}),

move_task: z.object({
  task_id: z.number().describe('Task ID to transfer'),
  current_agent: z.string().describe('Current agent (for verification)'),
  new_agent: z.string().describe('Agent to transfer to'),
  comment: z.string().describe('Handoff message/context'),
}),
```

Add tool definitions:

```typescript
{
  name: 'signup_for_task',
  description: 'Claim the highest priority idle task from your queue and mark it as working',
  inputSchema: zodToJsonSchema(toolSchemas.signup_for_task),
},
{
  name: 'move_task',
  description: 'Transfer a working task to another agent with status reset to idle and add handoff comment',
  inputSchema: zodToJsonSchema(toolSchemas.move_task),
},
```

### 4. Tool Handler Registration (src/tools/tool-handlers.ts)

Add cases to the switch statement:

```typescript
case 'signup_for_task':
  result = await signupForTaskHandler(taskService, validatedArgs as SignupForTaskParams);
  break;
case 'move_task':
  result = await moveTaskHandler(taskService, validatedArgs as MoveTaskParams);
  break;
```

### 5. Type Definitions (src/tools/handler-types.ts)

Add type definitions:

```typescript
export interface SignupForTaskParams {
  agent_name: string;
}

export interface MoveTaskParams {
  task_id: number;
  current_agent: string;
  new_agent: string;
  comment: string;
}
```

## Testing Requirements

### Unit Tests

**test signup_for_task service method:**
- ✅ Should return first idle task and update to working
- ✅ Should return null when no idle tasks available
- ✅ Should respect priority ordering (high priority first)
- ✅ Should respect creation time ordering (older tasks first)
- ✅ Should ignore tasks not assigned to agent
- ✅ Should ignore archived tasks
- ✅ Should ignore tasks already in working status
- ✅ Should be atomic (transaction rollback on error)

**test move_task service method:**
- ✅ Should successfully transfer task between agents
- ✅ Should change status from working to idle
- ✅ Should add comment with handoff message
- ✅ Should throw error if task not found
- ✅ Should throw error if current agent doesn't match
- ✅ Should throw error if task not in working status
- ✅ Should be atomic (transaction rollback on error)

### Integration Tests

**test signup_for_task tool:**
- ✅ Should claim task via MCP tool call
- ✅ Should return proper response format
- ✅ Should handle no available tasks gracefully

**test move_task tool:**
- ✅ Should transfer task via MCP tool call
- ✅ Should return proper response format
- ✅ Should handle validation errors properly

### Workflow Tests

**test complete agent workflow:**
- ✅ Agent A uses signup_for_task
- ✅ Agent A starts working on task
- ✅ Agent A uses move_task to transfer to Agent B
- ✅ Agent B uses signup_for_task to claim transferred task
- ✅ Agent B completes task

## Token Savings Analysis

### Current Approach (Multiple Tool Calls)

**Signup workflow:**
1. `get_my_queue(agent_name)` - Returns all tasks
2. Review queue, identify first idle task
3. `update_task(task_id, {status: 'working'})` - Update status
4. `get_task(task_id)` - Get full task with comments/links

**Token estimate:** ~3 round-trips, ~1500-2000 tokens (depending on queue size)

**Transfer workflow:**
1. `update_task(task_id, {assigned_to: new_agent, status: 'idle'})`
2. `add_comment(task_id, "Transferring to...")`
3. `get_task(task_id)` - Get updated task

**Token estimate:** ~3 round-trips, ~1000-1500 tokens

### New Approach (Single Tool Call)

**Signup workflow:**
1. `signup_for_task(agent_name)` - Returns claimed task

**Token estimate:** ~1 round-trip, ~500-800 tokens

**Transfer workflow:**
1. `move_task(task_id, current_agent, new_agent, comment)` - Returns transferred task

**Token estimate:** ~1 round-trip, ~500-800 tokens

### Estimated Savings

- **Signup:** ~50-60% token reduction
- **Transfer:** ~40-50% token reduction
- **Per-agent per-day:** If agent does 10 signups and 3 transfers, save ~15,000-20,000 tokens/day
- **Multi-agent system:** With 5 agents, save ~75,000-100,000 tokens/day

## Error Handling

Both tools follow these error handling principles:

1. **Validation Errors**: Return `isError: true` with descriptive message
2. **Database Errors**: Caught and wrapped with context
3. **Transaction Rollback**: Automatic on any error within transaction
4. **Detailed Messages**: Include task ID, agent names, and status information

## Dependencies

- No new external dependencies required
- Uses existing database client transaction support
- Uses existing service and tool patterns

## Backward Compatibility

- These are new tools, no breaking changes to existing tools
- Existing workflows continue to work unchanged
- Agents can adopt new tools incrementally

## Future Enhancements

Potential additions for even greater efficiency:

1. **batch_signup_for_tasks(agent_name, count)**: Claim multiple tasks at once
2. **complete_and_signup(task_id, agent_name)**: Complete current task and claim next in one call
3. **reassign_multiple_tasks(task_ids[], new_agent, comment)**: Bulk transfer
4. **auto_signup(agent_name, max_concurrent)**: Automatically maintain N working tasks

## References

- Existing service patterns: [`task-service.ts`](../../src/services/task-service.ts:1)
- Existing tool patterns: [`task-tools.ts`](../../src/tools/task-tools.ts:1)
- Database transaction support: [`client.ts`](../../src/db/client.ts:1)
- MCP tool registration: [`tool-handlers.ts`](../../src/tools/tool-handlers.ts:1)
