# Refinements - 2026-02-19

## Summary

This branch (`ragnar/refinements-20260219`) adds parent task status auto-propagation and improves CLI table formatting.

## Changes

### 1. Parent Task Status Auto-Propagation

**Business Rules Implemented:**
- When all child tasks are `idle` → parent is set to `idle`
- When any child task is `working` → parent is set to `working`
- When all child tasks are `complete` → parent is set to `complete`
- Status changes propagate recursively through multiple hierarchy levels
- If all children complete and then one reverts to `idle` or `working`, parent follows

**Implementation:**
- Added `updateParentStatus(parentId: number)` private method in [`TaskService`](src/services/task-service.ts)
- Hooked into task lifecycle methods:
  - `create()` - updates parent when a subtask is created
  - `update()` - updates parent when child status changes
  - `delete()` - updates parent when a child is deleted
  - `archive()` - updates parent when a child is archived
- Recursive propagation ensures changes bubble up through grandparents and beyond

**Testing:**
- Comprehensive test suite: [`tests/integration/parent-status-propagation.test.ts`](tests/integration/parent-status-propagation.test.ts)
- 11 test cases covering:
  - Single-level hierarchy scenarios
  - Multi-level hierarchy with recursive propagation
  - Edge cases (deletion, archiving, mixed sibling states)
- All tests passing ✅

### 2. CLI Table Formatting Improvements

**Column Width Changes:**
- **Queue column**: 12 → 17 chars (+5)
- **Title column**: 38 → 58 chars (+20)

**Multi-Line Description Support:**
- Removed manual truncation for title column
- Now uses `cli-table3`'s built-in `wordWrap: true` feature
- Long task titles automatically wrap to multiple lines within the cell

**File Modified:**
- [`tinytask-cli/src/formatters/table.ts`](tinytask-cli/src/formatters/table.ts)

## Testing

### Run Parent Status Tests
```bash
npm test -- parent-status-propagation
```

### Run All Core Tests
```bash
npm test -- task-blocking parent-status
```

### Build and Test CLI
```bash
# Build MCP server
npm run build

# Build CLI
cd tinytask-cli
npm run build
cd ..

# Test formatting with real data
./tinytask-cli/dist/index.js list
```

## Migration Notes

- **No database migration required** - uses existing schema
- **No breaking changes** - purely additive behavior
- **Backwards compatible** - existing tasks work as before

Parent status is now automatically maintained; manual status updates on parent tasks will be overridden when child status changes.

## Future Considerations

1. **Performance**: For very large task hierarchies (hundreds of children), consider caching or batch updates
2. **User Control**: May want a flag to disable auto-propagation for specific parent tasks
3. **Audit Trail**: Consider logging automatic status changes in `task_history` table — **Done in v2.2.0**: every mutation (including automatic promotions) is now logged to `task_history`
