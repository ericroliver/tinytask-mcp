# Agent Rules Standard (AGENTS.md)

## Project Overview

**TinyTask MCP** is a minimal task management system designed for LLM agent collaboration, exposed as a Model Context Protocol (MCP) server.

### Technology Stack
- **Runtime**: Node.js with TypeScript
- **Database**: SQLite with better-sqlite3
- **MCP Protocol**: @modelcontextprotocol/sdk
- **HTTP Server**: Express (Streamable HTTP default, SSE legacy)
- **Validation**: Zod
- **Testing**: Vitest
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier

### Project Structure
- **src/**: TypeScript source code
  - **db/**: Database client, schema, and initialization
  - **services/**: Business logic layer (task, comment, link services)
  - **tools/**: MCP tool definitions and handlers
  - **resources/**: MCP resource definitions and handlers
  - **server/**: MCP server and transport layers (stdio, SSE)
  - **types/**: TypeScript type definitions
- **tests/**: Test suite
  - **integration/**: Integration tests
  - **performance/**: Performance/load tests
  - **helpers/**: Test utilities
- **build/**: Compiled JavaScript output
- **docs/**: Technical and product documentation

## Build & Development Commands

```bash
# Development
npm run dev                 # Start with hot reload (tsx watch)

# Build
npm run build              # TypeScript compilation + copy assets
npm run copy-assets        # Copy schema.sql to build directory
npm run clean              # Remove build directory

# Production
npm start                  # Run compiled server (both modes)
npm run start:stdio        # Run in stdio mode only
npm run start:http         # Run Streamable HTTP only
npm run start:http:sse     # Run HTTP with legacy SSE transport
npm run start:both         # Run stdio + Streamable HTTP
npm run start:both:sse     # Run stdio + legacy SSE

# Testing
npm test                   # Run all tests with Vitest
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage report

# Code Quality
npm run lint               # Run ESLint on TypeScript files
npm run format             # Format code with Prettier
```

## Pre-Task Checklist

Before declaring any task complete, verify:
1. ✅ Build succeeds: `npm run build`
2. ✅ All tests pass: `npm test`
3. ✅ Linting passes: `npm run lint`
4. ✅ Code is formatted: `npm run format`
5. ✅ No TypeScript compilation errors

## Development Rules

### Core Principles
- Use SOLID principles at all times and subscribe to DRY
- We don't overuse interfaces but we use them in the important places
- Keep classes small and focused on a single responsibility
- Extract testable code to small self-contained functions when possible
- New code requires tests
- When changing code, ensure all tests are kept up to date

### Testing Requirements
- All tests use Vitest (not Jest or XUnit)
- New features require corresponding tests
- Test coverage should be maintained or improved
- Keep test code out of production projects
- **Critically Important**: We cannot PR work with failing tests
  - You break the test, you fix the test
  - Assume all unit tests were passing when you started
  - You might break tests outside your immediate work area - investigate all failures
  - You cannot remove existing tests just because it is hard to make them pass
  - It is not ok to remove tests because they are failing

### TypeScript Best Practices

#### Production Code Typing
- **NEVER use `any` in production code** - this will cause lint warnings
- Use `unknown` for dynamic types or generic parameters where the type is not known
- Use proper type assertions with specific types (e.g., `as string`, `as CreateTaskParams`)
- For Zod schemas, use `z.ZodRawShape` instead of `any`
- Create proper type definitions in a separate file when needed (e.g., [`handler-types.ts`](src/tools/handler-types.ts:1))
- Use `Record<string, unknown>` instead of `Record<string, any>`

#### Test Code Typing
- Test mocks can use `any` but must be typecast to avoid lint warnings
- Use `Partial<T>` for partial mocks in tests
- Prefix the typecast with `as` to avoid warnings: `validatedArgs as any as SpecificType`
- Only use `await` on actual Promise-returning functions
- Prefix unused test variables with underscore: `_variable`
- Use proper type imports and exports

#### Examples
```typescript
// ✅ DO: Use unknown in production code
query<T = unknown>(sql: string, params?: unknown[]): T[] {
  // implementation
}

// ✅ DO: Use specific type assertions
result = await createTaskHandler(taskService, validatedArgs as CreateTaskParams);

// ✅ DO: Use proper Zod types
function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  // implementation
}

// ✅ DO: Cast JSON parsing with known types
tags: task.tags ? JSON.parse(task.tags as string) : []

// ❌ DON'T: Use any in production code
const values: any[] = [];  // Causes lint warning

// ✅ DO in test code: Typecast to avoid warnings
const mockService = {} as any as TaskService;
```

### Code Quality Standards
- We don't like hard coded structures that will require maintenance
- When writing code and you need to deviate from the stated plan, halt and collaborate first
- Do NOT make architectural or systemic decisions without collaboration
- All changes must pass linting and formatting checks
- Keep production code separate from test code

### Testing & Running
- **Do NOT run the applications using the command line**
  - The developer normally has it running
  - Running from CLI tends to cause hanging processes
  - When it's time to run and test, notify the developer to test manually
- When you think there's a "race condition", explain in great detail how it is a race condition
  - Race conditions are often misdiagnosed - be thorough in analysis

### Task Completion Standards
Before declaring a task complete, ask yourself:
- Have you confirmed the build succeeds?
- Have you run the tests?
- Have you run lint?
- Have you confirmed no TypeScript errors?

Common pitfalls to avoid:
- **Priority Bias**: Mentally downgrading "low priority" work as optional. All work in the task is required.
- **Completion Pressure**: Feeling pressure to show progress after major fixes. Take time to complete properly.
- **Scope Creep Avoidance**: Assuming documentation tasks are "nice-to-have". Documentation is as important as code.
- **Time/Cost Consciousness**: Being overly conscious of task duration. Quality over speed.
  - Tasks can be accomplished efficiently, but not at the sacrifice of completeness
  - Minimize conversation for token efficiency, but never sacrifice solution quality

## Vitest Testing Best Practices

### Mock Typing
```typescript
// ✅ DO: Use proper typing for mocks
interface MockDatabase {
  prepare: (sql: string) => {
    run: () => void;
    get: () => unknown;
    all: () => unknown[];
  };
}

// ✅ DO: Use Partial<T> for partial mocks
const mockTask: Partial<Task> = {
  id: 1,
  title: 'Test Task'
};

// ❌ DON'T: Use any
const mockService: any = { ... };
```

### Async/Await in Tests
```typescript
// ✅ DO: Only await Promises
const result = await service.createTask(...);

// ❌ DON'T: Await void functions
await service.logSomething();  // If logSomething returns void

// ✅ DO: Remove await for void
service.logSomething();
```

### Unused Test Variables
```typescript
// ✅ DO: Prefix with underscore if testing side effects
const _connection = manager.createConnection();
```

### Test Organization
```typescript
// ✅ DO: Use describe blocks for grouping
describe('TaskService', () => {
  describe('createTask', () => {
    it('should create a task with valid data', async () => {
      // test implementation
    });
    
    it('should throw error with invalid data', async () => {
      // test implementation
    });
  });
});
```

## ESLint Configuration

The project uses ESLint with TypeScript support. Key rules:
- TypeScript strict mode enabled
- No unused variables (except prefixed with `_`)
- Consistent code style enforcement
- Test files may have relaxed rules where appropriate

## Environment Variables


- `TINYTASK_MODE`: Server mode (`stdio`, `http`, or `both`) - default: `both`
- `TINYTASK_ENABLE_SSE`: Enable legacy SSE transport when `true` - default: `false`
- `TINYTASK_PORT`: HTTP server port - default: `3000`
- `TINYTASK_DB_PATH`: Path to SQLite database file - default: `./data/tinytask.db`

## MCP Protocol Considerations

When working with MCP tools and resources:
- Tool handlers must validate input using Zod schemas
- Resource handlers must return properly formatted MCP resource objects
- Both stdio and HTTP transports (Streamable HTTP default, SSE legacy) must be supported
- Error responses must follow MCP error format
- All async operations must be properly awaited

## Architectural Boundaries

The project follows a layered architecture:
1. **Transport Layer** (stdio, Streamable HTTP, SSE) - handles communication
2. **MCP Server Layer** - implements MCP protocol
3. **Service Layer** - business logic
4. **Database Layer** - data persistence

Do not cross these boundaries inappropriately. Service layer should not know about transport details, database layer should not contain business logic, etc.

## Autonomous Decision Prevention

### Core Principle
When encountering implementation challenges or roadblocks that require changing the approved approach, ALWAYS seek user approval before making autonomous decisions to change course.

### Scenarios Requiring User Approval

1. **Implementation Approach Changes**
   - Encountering technical challenges that make the approved approach difficult
   - Required Action: Stop, document the challenge, ask for guidance
   - Prohibited: Autonomously reverting to previously declined approaches

2. **Scope Reduction**
   - Discovering the full scope is more complex than anticipated
   - Required Action: Present complexity and ask whether to proceed or adjust scope
   - Prohibited: Unilaterally reducing scope to "simpler" solutions

3. **Architecture Decisions**
   - Finding that approved architecture requires significant refactoring
   - Required Action: Document refactoring requirements and seek approval
   - Prohibited: Switching to different architectural patterns without approval

4. **Technical Debt vs. Proper Solution**
   - Encountering resistance from existing code
   - Required Action: Present trade-offs between proper solution and workarounds
   - Prohibited: Choosing technical debt solutions without explicit approval

### Required Response Pattern

When encountering implementation challenges:
1. **Stop Implementation**: Do not continue with alternative approaches
2. **Document Challenge**: Clearly explain the specific technical issue
3. **Present Options**: Outline available paths forward with pros/cons
4. **Seek Approval**: Ask explicitly which approach to take
5. **Wait for Response**: Do not proceed until receiving clear direction

Example:
```
I've encountered a technical challenge during implementation: [specific issue]

This affects our approved approach because: [explanation]

Available options:
1. [Option 1 with pros/cons]
2. [Option 2 with pros/cons]
3. [Option 3 with pros/cons]

How would you like me to proceed?
```

## Summary

This is a well-structured TypeScript MCP server project. Key focus areas:
- Maintain test coverage and never break tests
- Follow TypeScript best practices with proper typing
- Respect architectural boundaries
- Seek approval before making architectural decisions
- Complete all aspects of tasks (code, tests, docs) before marking complete
- Do not run the application from command line - let the developer handle runtime testing
