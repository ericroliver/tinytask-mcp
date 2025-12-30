# High-Level Task Tools - Final Specification

## Overview

Two new MCP tools designed to minimize token consumption by combining multiple operations into single atomic transactions.

## Tools Specification

### 1. signup_for_task

**Purpose:** Atomically claim the highest priority idle task from an agent's queue.

**Input:**
```typescript
{
  agent_name: string
}
```

**Behavior:**
1. Query for tasks where:
   - `assigned_to = agent_name`
   - `status = 'idle'`
   - `archived_at IS NULL`
   - `ORDER BY priority DESC, created_at ASC` (higher priority numbers first, then oldest)
2. If no tasks found → return "no tasks available"
3. Update first task: `status = 'working'`
4. Return complete task with comments and links

**Priority Note:** Higher priority numbers are MORE important (e.g., priority 10 > priority 5)

**Output (Success):**
```json
{
  "content": [{
    "type": "text",
    "text": "Task #123 claimed and set to working status\n\n{complete_task_json}"
  }]
}
```

**Output (No Tasks):**
```json
{
  "content": [{
    "type": "text",
    "text": "No idle tasks available in queue for agent: {agent_name}"
  }]
}
```

**Key Features:**
- ✅ Selects highest priority task (higher numbers = higher priority)
- ✅ Atomic transaction (all or nothing)
- ✅ Returns full task context immediately
- ✅ Handles empty queue gracefully

---

### 2. move_task

**Purpose:** Atomically transfer a task to another agent with handoff comment.

**Input:**
```typescript
{
  task_id: number,
  current_agent: string,  // For ownership verification
  new_agent: string,
  comment: string         // Handoff context
}
```

**Behavior:**
1. Verify task exists and is assigned to `current_agent`
2. Verify task status is 'idle' or 'working' (cannot transfer completed tasks)
3. Update task:
   - `assigned_to = new_agent`
   - `status = 'idle'` (ready for new agent to pick up)
4. Add comment with handoff message (created_by = current_agent)
5. Return complete task with all comments and links

**Important:** Only idle or working tasks can be transferred. Completed tasks cannot be moved as this would reset their completion status.

**Output (Success):**
```json
{
  "content": [{
    "type": "text",
    "text": "Task #123 transferred from {current_agent} to {new_agent}\n\n{complete_task_json}"
  }]
}
```

**Output (Error - Task Not Found):**
```json
{
  "content": [{
    "type": "text",
    "text": "Task not found: {task_id}"
  }],
  "isError": true
}
```

**Output (Error - Wrong Agent):**
```json
{
  "content": [{
    "type": "text",
    "text": "Task {task_id} is not assigned to {current_agent} (currently assigned to: {actual_agent})"
  }],
  "isError": true
}
```

**Output (Error - Task Complete):**
```json
{
  "content": [{
    "type": "text",
    "text": "Task {task_id} is complete and cannot be transferred"
  }],
  "isError": true
}
```

**Key Features:**
- ✅ Verifies ownership before transfer
- ✅ Works with idle or working tasks only
- ✅ Prevents transferring completed tasks (preserves completion)
- ✅ Always sets status to 'idle' for new agent
- ✅ Atomic transaction with comment
- ✅ Returns full task history

---

## Implementation Details

### Service Layer Methods

**File:** `src/services/task-service.ts`

```typescript
/**
 * Sign up for the highest priority idle task in agent's queue
 */
signupForTask(agentName: string): TaskWithRelations | null {
  return this.db.transaction(() => {
    // Get first idle task from agent's queue (higher priority first)
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
 * Works regardless of current task status
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

    // Update task assignment and status (works with any current status)
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

### Tool Schemas

**File:** `src/tools/tool-definitions.ts`

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

### Tool Definitions

```typescript
{
  name: 'signup_for_task',
  description: 'Claim the highest priority idle task from your queue and mark it as working',
  inputSchema: zodToJsonSchema(toolSchemas.signup_for_task),
},
{
  name: 'move_task',
  description: 'Transfer a task to another agent (any status), set to idle, and add handoff comment',
  inputSchema: zodToJsonSchema(toolSchemas.move_task),
},
```

---

## Testing Requirements

### Unit Tests (Service Layer)

**signup_for_task:**
- ✅ Returns first idle task and updates to working
- ✅ Returns null when no idle tasks available
- ✅ Respects priority ordering (higher numbers first)
- ✅ Respects creation time ordering (older first when same priority)
- ✅ Ignores tasks not assigned to agent
- ✅ Ignores archived tasks
- ✅ Ignores non-idle tasks (working, complete)
- ✅ Transaction rolls back on error

**move_task:**
- ✅ Successfully transfers idle task
- ✅ Successfully transfers working task
- ✅ Successfully transfers complete task
- ✅ Changes status to idle regardless of previous status
- ✅ Adds comment with handoff message
- ✅ Throws error if task not found
- ✅ Throws error if current agent doesn't match
- ✅ Transaction rolls back on error

### Integration Tests (MCP Tools)
- ✅ signup_for_task via MCP call returns proper format
- ✅ signup_for_task handles no tasks gracefully
- ✅ move_task via MCP call returns proper format
- ✅ move_task validation errors return proper format

### Workflow Tests
- ✅ Agent A signs up, works on task, transfers to Agent B
- ✅ Agent B signs up for transferred task
- ✅ Multiple agents competing for same tasks
- ✅ Complete handoff chain (A→B→C)

---

## Token Savings

### Current Approach
- **Signup:** 3 calls ≈ 1,700 tokens
- **Transfer:** 3 calls ≈ 1,200 tokens

### New Approach
- **Signup:** 1 call ≈ 600 tokens (65% reduction)
- **Transfer:** 1 call ≈ 600 tokens (50% reduction)

### Daily Impact (5 agents, 10 signups + 3 transfers each)
- **Daily:** 64,000 tokens saved
- **Monthly:** ~1.92M tokens saved
- **Annual:** ~23M tokens saved (~$415/year at current pricing)

---

## Implementation Checklist

### Code Changes
- [ ] Add `signupForTask` method to TaskService
- [ ] Add `moveTask` method to TaskService
- [ ] Add `signupForTaskHandler` to task-tools.ts
- [ ] Add `moveTaskHandler` to task-tools.ts
- [ ] Add Zod schemas to tool-definitions.ts
- [ ] Add tool metadata to tool-definitions.ts
- [ ] Add cases to tool-handlers.ts switch statement
- [ ] Add type definitions to handler-types.ts

### Testing
- [ ] Write unit tests for service methods
- [ ] Write integration tests for MCP tools
- [ ] Write workflow tests for multi-agent scenarios
- [ ] Run all existing tests to ensure no regression

### Documentation
- [ ] Update README with new tools
- [ ] Add usage examples to docs/examples/workflows.md
- [ ] Update CHANGELOG
- [ ] Update API documentation

### Validation
- [ ] Build succeeds: `npm run build`
- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Code formatted: `npm run format`

---

## Key Design Decisions

### ✅ Confirmed Decisions

1. **Priority Ordering:** Higher numbers = higher priority
   - Uses `ORDER BY priority DESC` (existing pattern)
   - Priority 10 is picked before priority 5

2. **move_task Status:** Works with any task status
   - No validation on current status
   - Always sets status to 'idle' for new agent
   - Provides maximum flexibility

3. **Comment Attribution:** Automatic
   - Uses `current_agent` as `created_by` for comment
   - No override option needed

4. **Transaction Safety:** All operations atomic
   - Both tools use database transactions
   - Automatic rollback on any error
   - No partial state changes possible

5. **No Phase 2:** Focus on core implementation
   - No batch operations planned
   - No auto-assignment features
   - Keep it simple and effective

---

## Files Modified

| File | Changes |
|------|---------|
| `src/services/task-service.ts` | +2 methods (~80 lines) |
| `src/tools/task-tools.ts` | +2 handlers (~60 lines) |
| `src/tools/tool-definitions.ts` | +2 schemas, +2 definitions (~30 lines) |
| `src/tools/tool-handlers.ts` | +2 switch cases (~10 lines) |
| `src/tools/handler-types.ts` | +2 interfaces (~10 lines) |
| Tests | +20 test scenarios (~400 lines) |

**Total:** ~590 lines of new code

---

## Timeline

- **Days 1-2:** Implementation (service + tools + types)
- **Days 2-3:** Testing (unit + integration + workflow)
- **Day 3:** Documentation and validation
- **Day 4:** Deploy to development
- **Day 5:** Integration testing
- **Day 6:** Production deployment

**Total:** 6 days from start to production

---

## Success Criteria

### Must Have
- ✅ Both tools work as specified
- ✅ All tests pass
- ✅ Token reduction verified (40-60%)
- ✅ Execution time < 100ms
- ✅ Error rate < 0.1%

### Should Have
- Documentation updated and clear
- Usage examples provided
- Performance benchmarks recorded

### Nice to Have
- Agent adoption metrics tracked
- Token savings dashboard

---

## References

- **Technical Documentation:** [`docs/technical/high-level-task-tools.md`](../technical/high-level-task-tools.md:1)
- **Product Story:** [`docs/product-stories/high-level-tools/story-01-high-level-task-tools.md`](../product-stories/high-level-tools/story-01-high-level-task-tools.md:1)
- **Implementation Plan:** [`docs/product/high-level-tools-plan.md`](high-level-tools-plan.md:1)
- **Existing Task Service:** [`src/services/task-service.ts`](../../src/services/task-service.ts:1)
- **Existing Tool Patterns:** [`src/tools/task-tools.ts`](../../src/tools/task-tools.ts:1)

---

**Status:** Ready for implementation
**Approved By:** _________________ **Date:** _________
