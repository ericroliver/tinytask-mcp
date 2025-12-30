# Story: High-Level Task Tools for Token Efficiency

## Overview
Implement two high-level task management tools that combine multiple operations into single atomic transactions, significantly reducing token consumption for common agent workflows.

## Problem Statement
Agents currently need multiple tool calls to perform common task management operations:

**Current Signup Workflow (3+ tool calls):**
1. Call `get_my_queue(agent_name)` to see all assigned tasks
2. Parse response to find first idle task
3. Call `update_task(task_id, {status: 'working'})` to claim it
4. Call `get_task(task_id)` to get full details with comments/links

**Current Transfer Workflow (3+ tool calls):**
1. Call `update_task(task_id, {assigned_to: new_agent, status: 'idle'})`
2. Call `add_comment(task_id, "Transferring to X because...")` to add context
3. Call `get_task(task_id)` to confirm the transfer

Each round-trip consumes tokens for both the request and response. With multiple agents performing many task operations per day, this adds up quickly.

## Business Value
- **Token Efficiency**: Reduce token consumption by 40-60% for common workflows
- **Agent Efficiency**: Faster task operations with fewer round-trips
- **Reduced Latency**: Single transaction instead of multiple sequential calls
- **Improved Reliability**: Atomic operations prevent partial failures

## Requirements

### Functional Requirements

#### FR1: signup_for_task Tool
**User Story:** As an agent, I want to claim the next task from my queue in a single operation, so I can minimize token usage and start work immediately.

**Acceptance Criteria:**
- ✅ Tool accepts `agent_name` as input parameter
- ✅ Queries agent's queue for idle tasks (assigned to agent, status='idle', not archived)
- ✅ Selects highest priority task first, then oldest task (priority DESC, created_at ASC)
- ✅ Updates selected task status to 'working' atomically
- ✅ Returns complete task with comments and links
- ✅ Returns appropriate message if no idle tasks available
- ✅ All operations execute within single database transaction
- ✅ Transaction rolls back on any error

**Input:**
```json
{
  "agent_name": "string"
}
```

**Output (Success with task):**
```json
{
  "content": [{
    "type": "text",
    "text": "Task #123 claimed and set to working status\n\n{complete_task_json}"
  }]
}
```

**Output (No tasks available):**
```json
{
  "content": [{
    "type": "text",
    "text": "No idle tasks available in queue for agent: agent_name"
  }]
}
```

#### FR2: move_task Tool
**User Story:** As an agent, I want to transfer a task to another agent with a handoff comment in a single operation, so the transfer is atomic and efficient.

**Acceptance Criteria:**
- ✅ Tool accepts `task_id`, `current_agent`, `new_agent`, and `comment` as parameters
- ✅ Verifies task exists and is assigned to `current_agent`
- ✅ Verifies task is not in 'complete' status
- ✅ Works with idle or working tasks only
- ✅ Updates task assignment to `new_agent`
- ✅ Sets task status to 'idle' (ready for new agent to pick up)
- ✅ Adds comment with handoff message attributed to `current_agent`
- ✅ Returns complete task with all comments and links
- ✅ All operations execute within single database transaction
- ✅ Returns clear error if task not found
- ✅ Returns clear error if current agent doesn't match
- ✅ Returns clear error if task is complete

**Input:**
```json
{
  "task_id": number,
  "current_agent": "string",
  "new_agent": "string",
  "comment": "string"
}
```

**Output (Success):**
```json
{
  "content": [{
    "type": "text",
    "text": "Task #123 transferred from current_agent to new_agent\n\n{complete_task_json}"
  }]
}
```

**Output (Error - Not assigned):**
```json
{
  "content": [{
    "type": "text",
    "text": "Task 123 is not assigned to current_agent (currently assigned to: someone_else)"
  }],
  "isError": true
}
```

**Output (Error - Task complete):**
```json
{
  "content": [{
    "type": "text",
    "text": "Task 123 is complete and cannot be transferred"
  }],
  "isError": true
}
```

### Non-Functional Requirements

#### NFR1: Performance
- Transaction execution time must be < 100ms under normal load
- No degradation to existing tool performance

#### NFR2: Data Integrity
- All operations must be atomic (all succeed or all fail)
- Database transactions must use proper isolation level
- No partial state changes should be possible

#### NFR3: Error Handling
- All validation errors return descriptive messages
- Database errors are caught and wrapped with context
- Error responses follow MCP error format

#### NFR4: Backward Compatibility
- Existing tools continue to work unchanged
- No breaking changes to existing APIs
- New tools are additive only

## Technical Design

### Architecture
Follow existing TinyTask layered architecture:
1. **Tool Layer** (`src/tools/task-tools.ts`): Handler functions
2. **Service Layer** (`src/services/task-service.ts`): Business logic methods
3. **Database Layer** (`src/db/client.ts`): Transaction support

### Database Transactions
Both tools use database transactions to ensure atomicity:

```typescript
// Example pattern
return this.db.transaction(() => {
  // 1. Query and validate
  // 2. Perform updates
  // 3. Return result
  // Auto-rollback on any error
});
```

### Service Layer Methods

**TaskService.signupForTask(agentName: string): TaskWithRelations | null**
- Returns first idle task from agent's queue and marks it working
- Returns null if no idle tasks available
- Atomic transaction

**TaskService.moveTask(taskId, currentAgent, newAgent, comment): TaskWithRelations**
- Validates task ownership and status
- Updates assignment and status
- Adds handoff comment
- Returns updated task
- Throws error if validation fails
- Atomic transaction

### Tool Definitions
Add to `src/tools/tool-definitions.ts`:

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

## Implementation Tasks

### Task 1: Add Service Layer Methods
**File:** `src/services/task-service.ts`
- [ ] Add `signupForTask(agentName: string)` method
- [ ] Add `moveTask(taskId, currentAgent, newAgent, comment)` method
- [ ] Ensure both use database transactions
- [ ] Add comprehensive error handling

### Task 2: Add Tool Handlers
**File:** `src/tools/task-tools.ts`
- [ ] Add `signupForTaskHandler` function
- [ ] Add `moveTaskHandler` function
- [ ] Follow existing handler patterns
- [ ] Add proper error wrapping

### Task 3: Add Tool Definitions
**File:** `src/tools/tool-definitions.ts`
- [ ] Add Zod schema for `signup_for_task`
- [ ] Add Zod schema for `move_task`
- [ ] Add tool metadata for both tools
- [ ] Ensure proper parameter descriptions

### Task 4: Register Tool Handlers
**File:** `src/tools/tool-handlers.ts`
- [ ] Add case for `signup_for_task` in switch statement
- [ ] Add case for `move_task` in switch statement
- [ ] Import new handler functions
- [ ] Add type definitions to imports

### Task 5: Add Type Definitions
**File:** `src/tools/handler-types.ts`
- [ ] Add `SignupForTaskParams` interface
- [ ] Add `MoveTaskParams` interface
- [ ] Export new types

### Task 6: Write Tests
**Files:** `tests/integration/` and `tests/performance/`

**Service Layer Tests:**
- [ ] Test `signupForTask` returns first idle task
- [ ] Test `signupForTask` returns null when no tasks
- [ ] Test `signupForTask` respects priority ordering
- [ ] Test `signupForTask` respects creation time ordering
- [ ] Test `signupForTask` ignores non-idle tasks
- [ ] Test `signupForTask` ignores archived tasks
- [ ] Test `signupForTask` transaction rollback on error
- [ ] Test `moveTask` successfully transfers task
- [ ] Test `moveTask` adds comment correctly
- [ ] Test `moveTask` throws on task not found
- [ ] Test `moveTask` throws on wrong agent
- [ ] Test `moveTask` throws on wrong status
- [ ] Test `moveTask` transaction rollback on error

**Tool Integration Tests:**
- [ ] Test `signup_for_task` via MCP tool call
- [ ] Test `signup_for_task` response format
- [ ] Test `signup_for_task` with no tasks available
- [ ] Test `move_task` via MCP tool call
- [ ] Test `move_task` response format
- [ ] Test `move_task` validation errors

**Workflow Tests:**
- [ ] Test complete agent handoff workflow
- [ ] Test multiple agents competing for tasks
- [ ] Test transfer chain (A→B→C)

### Task 7: Update Documentation
- [ ] Update README with new tools
- [ ] Add usage examples to `docs/examples/workflows.md`
- [ ] Update CHANGELOG
- [ ] Add API documentation for new tools

## Testing Strategy

### Unit Tests
- Service layer methods in isolation
- Mock database for predictable results
- Test all edge cases and error conditions

### Integration Tests
- Full MCP tool calls through server
- Real database with test data
- Verify response formats and content

### Workflow Tests
- Multi-agent scenarios
- Complete task lifecycle with new tools
- Performance comparisons with old approach

### Performance Tests
- Measure token reduction vs old approach
- Measure execution time of transactions
- Load testing with concurrent requests

## Success Metrics

### Primary Metrics
- **Token Reduction**: 40-60% fewer tokens for signup and transfer workflows
- **Execution Time**: < 100ms for each tool operation
- **Error Rate**: < 0.1% failure rate in production

### Secondary Metrics
- **Adoption Rate**: Track usage of new vs old tools
- **Agent Efficiency**: Measure tasks processed per agent per day
- **System Throughput**: Overall task processing velocity

## Token Savings Analysis

### Before (Current Approach)
**Signup:** 3 tool calls ≈ 1,500-2,000 tokens
**Transfer:** 3 tool calls ≈ 1,000-1,500 tokens

### After (New Approach)
**Signup:** 1 tool call ≈ 500-800 tokens (60% reduction)
**Transfer:** 1 tool call ≈ 500-800 tokens (50% reduction)

### Projected Savings
- **Per agent per day:** 10 signups + 3 transfers = 15,000-20,000 tokens saved
- **5-agent system per day:** 75,000-100,000 tokens saved
- **Monthly (5 agents):** ~2.25-3 million tokens saved

## Risks and Mitigations

### Risk 1: Transaction Locking
**Risk:** High concurrency could cause database lock contention
**Mitigation:** 
- Use existing transaction patterns that release locks immediately
- Monitor lock wait times in production
- Consider optimistic locking if needed

### Risk 2: Agent Confusion
**Risk:** Agents might not discover new tools
**Mitigation:**
- Clear tool descriptions
- Update agent documentation
- Keep old tools working for gradual migration

### Risk 3: Complex Workflows
**Risk:** New atomic operations might not cover all edge cases
**Mitigation:**
- Old tools remain available for complex scenarios
- Design for most common workflows (80/20 rule)
- Plan for future enhancements based on usage patterns

## Future Enhancements

### Phase 2 Candidates
1. **batch_signup_for_tasks(agent_name, count)**: Claim multiple tasks at once
2. **complete_and_signup(task_id, agent_name)**: Complete current + claim next
3. **auto_assign_tasks(agent_name, max_concurrent)**: Automatic task management
4. **bulk_move_tasks(task_ids[], new_agent, comment)**: Bulk transfers

### Monitoring and Observability
- Add metrics for tool usage patterns
- Track token savings in production
- Monitor transaction performance
- Alert on high error rates

## Dependencies

### Internal
- Existing database transaction support
- Existing service layer patterns
- Existing tool registration system
- Existing test infrastructure

### External
- None (uses existing dependencies)

## Deployment Plan

### Phase 1: Development and Testing
1. Implement service layer methods
2. Add tool handlers and definitions
3. Write comprehensive tests
4. Code review and refinement

### Phase 2: Staged Rollout
1. Deploy to development environment
2. Run integration and performance tests
3. Deploy to staging with monitoring
4. Gradual production rollout

### Phase 3: Adoption
1. Update agent documentation
2. Share token savings metrics
3. Gather feedback from agents
4. Plan Phase 2 enhancements

## Acceptance Criteria

### Definition of Done
- ✅ All service layer methods implemented and tested
- ✅ All tool handlers implemented and tested
- ✅ All tests passing (unit, integration, workflow)
- ✅ Code reviewed and approved
- ✅ Documentation updated
- ✅ CHANGELOG updated
- ✅ Deployed to production
- ✅ Token savings verified in production

## References
- Technical Design: [`docs/technical/high-level-task-tools.md`](../../technical/high-level-task-tools.md:1)
- Service Layer: [`src/services/task-service.ts`](../../../src/services/task-service.ts:1)
- Tool Handlers: [`src/tools/task-tools.ts`](../../../src/tools/task-tools.ts:1)
- Database Client: [`src/db/client.ts`](../../../src/db/client.ts:1)
