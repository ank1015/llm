This file contains instructions for Claude Code on how to develop and maintain this codebase in an "agent-ready" manner. These are meta-level guidelines about HOW to write code, structure files, and maintain documentation so that AI coding agents (including yourself in future sessions) can work effectively.
This is not about the project's domain logic—it's about development practices.

# Core Philosophy

You are not just writing code—you are writing code that future AI agents (including yourself in new sessions) will need to understand, modify, and extend. Every file you create, every function you write, and every decision you make should optimize for:

1. Discoverability — Can an agent find what it needs quickly?
2. Understandability — Can an agent grasp context without extensive exploration?
3. Verifiability — Can an agent confirm its changes work correctly?
4. Safety — Are there guardrails preventing catastrophic mistakes?

Remember: You have no memory between sessions. The codebase itself IS your memory. Document accordingly.

# AGENTS.md Management

## Root AGENTS.md

Maintain a root AGENTS.md file that serves as the entry point for any AI agent. This file must be:

- Concise: Under 90 lines for simple projects, under 300 lines for complex monorepos
- Action-oriented: Executable commands, not philosophy
- Current: Update it whenever you change build processes, add packages, or modify conventions

Structure the root AGENTS.md in this exact order (agents read top-to-bottom, most important first):

```markdown
# Project Name

One-line description of what this project does.

## Commands

[Exact commands with flags — agents copy-paste these directly]

## Architecture

[Where things live — directory map with one-line descriptions]

## Conventions

[Code style rules — specific, not vague]

## Key Files

[Entry points and important files to understand first]

## Package Guide

[For monorepos: links to package-specific AGENTS.md files]

## Boundaries

[What agents must never do, should ask about, and can freely do]
```

## Package-Level AGENTS.md

Create an AGENTS.md in each package directory (packages/\*/AGENTS.md). These files should:

- Focus ONLY on that package's concerns
- Assume the agent has read the root AGENTS.md
- Include package-specific commands, conventions, and key files
- Be even shorter than root (50 lines typical)

Example structure for a package AGENTS.md:

```markdown
# Package Name

What this package does and its role in the monorepo.

## Commands

- `pnpm test` — Run tests for this package
- `pnpm build` — Build this package

## Structure

- `src/index.ts` — Public exports
- `src/internal/` — Internal modules, not exported

## Conventions

[Package-specific conventions only]

## Dependencies

- Depends on: `@org/shared`
- Depended on by: `@org/web`, `@org/server`
```

## Keeping AGENTS.md Current

Every time you:

- Add a new package → Create its AGENTS.md and link from root
- Change a build command → Update AGENTS.md immediately
- Add a new convention → Document it before moving on
- Create an important file → Add it to "Key Files" if agents need to know about it

Do not:

- Let AGENTS.md drift from reality
- Add task-specific instructions (those go in separate docs)
- Duplicate content that's in README.md
- Include obvious things ("JavaScript files end in .js")

# Code Structure Principles

## Directory Organization

Use this structure for TypeScript monorepos:

project-root/
├── AGENTS.md # Agent instructions (cross-tool)
├── CLAUDE.md # This file (Claude Code specific)
├── README.md # Human-focused documentation
├── package.json # Root package.json
├── pnpm-workspace.yaml # Workspace definition
├── turbo.json # Task orchestration
├── tsconfig.base.json # Shared TypeScript config
├── .env.example # Environment template
├── .gitignore
├── packages/
│ ├── <package-name>/
│ │ ├── AGENTS.md # Package-specific agent instructions
│ │ ├── package.json
│ │ ├── tsconfig.json # Extends base config
│ │ └── src/
│ │ ├── index.ts # Public exports only
│ │ ├── <feature>/ # Feature modules
│ │ └── **tests**/ # Or colocate tests
├── docs/
│ ├── ARCHITECTURE.md # High-level architecture
│ └── adr/ # Architecture Decision Records
│ └── 000-template.md
└── scripts/ # Build/dev scripts

## File Naming Conventions

Apply these consistently across all packages:
Type Convention Example  
Directories kebab-case user-service/
TypeScript files kebab-case.ts user-service.ts
React components PascalCase.tsx UserProfile.tsx
Test files _.test.ts or _.spec.ts user-service.test.ts
Type definition files _.types.ts user.types.ts
Constants files _.constants.ts api.constants.ts
Config files \*.config.ts database.config.ts

## Module Organization

One concern per file. This is critical for agent comprehension.

```
// ❌ BAD: Multiple concerns in one file
// user.ts - 500 lines with types, validation, service, and utils

// ✅ GOOD: Separated concerns
// user.types.ts - Type definitions
// user.validation.ts - Zod schemas
// user.service.ts - Business logic
// user.repository.ts - Data access
// user.utils.ts - Helper functions
```

## Export explicitly from index.ts:

```
// packages/shared/src/index.ts
export { UserSchema, type User } from './user/user.types';
export { validateUser } from './user/user.validation';
// Don't export internal utilities
```

## Function and Variable Naming

Use descriptive names with auxiliary verbs for booleans:

```
// ✅ GOOD: Clear intent
const isLoading = true;
const hasPermission = checkPermission(user);
const canSubmit = isValid && !isLoading;
const shouldRefetch = isStale || forceRefresh;

// ❌ BAD: Ambiguous
const loading = true;
const permission = checkPermission(user);
const submit = isValid && !isLoading;
```

Use verb prefixes for functions:

```
// ✅ GOOD: Action is clear
function getUserById(id: string): Promise<User>
function validateEmail(email: string): boolean
function transformResponse(data: unknown): ApiResponse
function handleSubmit(event: FormEvent): void

// ❌ BAD: Unclear action
function user(id: string): Promise<User>
function email(email: string): boolean
```

# TypeScript Practices

## Strict Configuration

Always use strict TypeScript. Create or maintain tsconfig.base.json:

```
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

Package configs extend this:

```
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

## Type Definitions

Always export types explicitly. Types are documentation for agents.

```
// ✅ GOOD: Self-documenting types
/**
 * Represents a user in the system.
 * @see {@link UserRole} for permission levels
 */
export interface User {
  /** Unique identifier (UUID v4) */
  id: string;
  /** User's email address, must be unique */
  email: string;
  /** Display name, 2-50 characters */
  displayName: string;
  /** User's permission level */
  role: UserRole;
  /** ISO 8601 timestamp of account creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update, null if never updated */
  updatedAt: string | null;
}

export type UserRole = 'admin' | 'member' | 'guest';

/** Input for creating a new user, id and timestamps are auto-generated */
export type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
```

Use discriminated unions for complex state:

```
// ✅ GOOD: States are explicit and exhaustive
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// Usage enables exhaustive checking
function handleState<T>(state: AsyncState<T>) {
  switch (state.status) {
    case 'idle':
      return 'Not started';
    case 'loading':
      return 'Loading...';
    case 'success':
      return state.data; // TypeScript knows `data` exists
    case 'error':
      return state.error.message; // TypeScript knows `error` exists
  }
}
```

Use Zod for runtime validation with inferred types:

```
import { z } from 'zod';

// Schema is the source of truth
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(2).max(50),
  role: z.enum(['admin', 'member', 'guest']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
});

// Type is derived from schema — always in sync
export type User = z.infer<typeof UserSchema>;

// Validation function with proper typing
export function parseUser(data: unknown): User {
  return UserSchema.parse(data);
}
```

Avoid These TypeScript Anti-patterns

```
// ❌ NEVER use `any`
function processData(data: any) { ... }

// ✅ Use `unknown` and narrow
function processData(data: unknown) {
  if (isUser(data)) {
    // Now TypeScript knows it's a User
  }
}

// ❌ NEVER use non-null assertion without certainty
const user = users.find(u => u.id === id)!;

// ✅ Handle the undefined case
const user = users.find(u => u.id === id);
if (!user) {
  throw new NotFoundError(`User ${id} not found`);
}

// ❌ NEVER ignore TypeScript errors
// @ts-ignore
brokenCode();

// ✅ Fix the type issue or use @ts-expect-error with explanation
// @ts-expect-error - Legacy API returns number, migration tracked in #123
const result = legacyApi();
```

# Testing Practices

## Test Infrastructure

Use Vitest for TypeScript projects. Configure in each package:

```
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // or 'jsdom' for frontend
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.test.ts', '**/*.types.ts', '**/index.ts'],
    },
  },
});
```

## Test Naming and Structure

Write tests that serve as documentation:

describe('UserService', () => {
describe('getUserById', () => {
it('should return user when found', async () => {
// Arrange
const userId = 'test-uuid';
const expectedUser = createTestUser({ id: userId });
mockRepository.findById.mockResolvedValue(expectedUser);

      // Act
      const result = await userService.getUserById(userId);

      // Assert
      expect(result).toEqual(expectedUser);
    });

    it('should throw NotFoundError when user does not exist', async () => {
      // Arrange
      mockRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(userService.getUserById('nonexistent'))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when id is empty string', async () => {
      await expect(userService.getUserById(''))
        .rejects.toThrow(ValidationError);
    });

});
});

## Test-Driven Development Workflow

When implementing new features, follow TDD:

1. Write failing test first — Define expected behavior
2. Implement minimal code — Make the test pass
3. Refactor — Clean up while tests protect you

This is especially effective for agents because:

- Tests provide clear specifications in fewer tokens than prose
- Fast feedback loop enables rapid iteration
- Regression prevention when touching existing code

# Documentation Practices

## Code Comments

Write comments that explain WHY, not WHAT:

```
// ❌ BAD: Describes what code does (obvious from reading)
// Loop through users and filter active ones
const activeUsers = users.filter(u => u.isActive);

// ✅ GOOD: Explains why this approach was chosen
// Filter in memory rather than DB query because the user list
// is always small (<100) and we need to check computed properties
const activeUsers = users.filter(u => u.isActive);

// ✅ GOOD: Documents non-obvious business logic
// Grace period of 7 days after subscription ends before
// revoking access (legal requirement per ToS v2.3)
const GRACE_PERIOD_DAYS = 7;
```

## JSDoc for Public APIs

Document all exported functions, classes, and types:

````
/**
 * Authenticates a user with email and password.
 *
 * @param credentials - The user's login credentials
 * @returns Promise resolving to authenticated user with session token
 * @throws {AuthenticationError} When credentials are invalid
 * @throws {RateLimitError} When too many failed attempts (max 5 per minute)
 *
 * @example
 * ```typescript
 * const { user, token } = await authenticateUser({
 *   email: 'user@example.com',
 *   password: 'securepassword'
 * });
 * ```
 */
export async function authenticateUser(
  credentials: LoginCredentials
): Promise<AuthResult> {
  // Implementation
}
````

## Architecture Decision Records (ADRs)

When making significant architectural decisions, create an ADR:

```
# ADR-001: Use PostgreSQL for Primary Database

## Status
Accepted

## Context
We need a primary database for storing user data, content, and relationships.
Options considered: PostgreSQL, MySQL, MongoDB, PlanetScale.

## Decision
Use PostgreSQL with Prisma ORM.

## Consequences
### Positive
- Strong typing with Prisma
- ACID compliance for financial transactions
- Excellent JSON support for flexible schemas

### Negative
- More complex scaling than managed solutions
- Team needs PostgreSQL expertise

## References
- [Prisma with PostgreSQL guide](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
```

Reference ADRs from AGENTS.md: "Before modifying database schema, read @docs/adr/001-postgresql.md"

# Git Workflow

## Commit Messages

Use Conventional Commits format:

```
<type>(<scope>): <description>
```

Types:

- feat: New feature
- fix: Bug fix
- docs: Documentation only
- refactor: Code change that neither fixes a bug nor adds a feature
- test: Adding or updating tests
- chore: Build process, dependencies, or tooling

Examples:

feat(auth): add password reset functionality
fix(api): handle null response from external service
docs(readme): update installation instructions
refactor(user-service): extract validation logic to separate module
test(auth): add integration tests for OAuth flow
chore(deps): upgrade vitest to v1.0

## Branch Naming:

feature/<scope>/<short-description>
fix/<scope>/<short-description>
refactor/<scope>/<short-description>
docs/<short-description>

Examples:
feature/auth/password-reset
fix/api/null-response-handling
refactor/user-service/extract-validation

## When Committing

Before every commit:

1. Run pnpm typecheck — Ensure no type errors
2. Run pnpm lint — Ensure code style compliance
3. Run pnpm test — Ensure tests pass
4. Review diff — No debug code, console.logs, or commented code

# Environment and Configuration

## Environment Variables

Always maintain .env.example with ALL required variables:

```
# .env.example
# Copy to .env and fill in values

# ============================================
# Database
# ============================================
# PostgreSQL connection string
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myapp

# ============================================
# Authentication
# ============================================
# JWT secret for signing tokens (min 32 characters)
# Generate with: openssl rand -base64 32
JWT_SECRET=your-secret-key-min-32-chars-long

# JWT token expiration (e.g., "1h", "7d", "30d")
JWT_EXPIRATION=7d

# ============================================
# External Services
# ============================================
# Stripe API keys (get from dashboard.stripe.com)
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# ============================================
# Application
# ============================================
# Server port
PORT=3000

# Environment: development | staging | production
NODE_ENV=development
```

## Configuration Validation

Validate environment at startup with Zod:

```
// packages/server/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRATION: z.string().default('7d'),
});

// This will throw with helpful error message if validation fails
export const env = envSchema.parse(process.env);

// Type is inferred from schema
export type Env = z.infer<typeof envSchema>;
```

# Dependency Management

## Adding Dependencies

When adding a new dependency:

1. Prefer well-maintained, typed packages
2. Check bundle size for frontend packages (bundlephobia.com)
3. Add to correct package — Don't install at root unless truly shared
4. Use exact versions for reproducibility

```
# Add to specific package
pnpm add zod --filter @org/shared

# Add dev dependency
pnpm add -D vitest --filter @org/server

# Add to all packages (rare)
pnpm add -w typescript
```

## Shared Dependencies

Put these in root or shared package:

- TypeScript
- ESLint / Prettier
- Vitest
- Common utilities (zod, date-fns)

Put these in specific packages:

- React (only web)
- Express/Fastify (only server)
- Package-specific libraries

# Error Handling

## Custom Error Classes

Create a hierarchy of typed errors:

```
// packages/shared/src/errors/base.error.ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// packages/shared/src/errors/http.errors.ts
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
```

Error Handling Pattern

```
// ✅ GOOD: Specific, typed error handling
async function getUserById(id: string): Promise<User> {
  if (!id) {
    throw new ValidationError('User ID is required');
  }

  const user = await repository.findById(id);

  if (!user) {
    throw new NotFoundError('User', id);
  }

  return user;
}

// In route handler
app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await getUserById(req.params.id);
    res.json(user);
  } catch (error) {
    next(error); // Let error middleware handle it
  }
});
```

# Security Practices

Never Do These

- Never commit secrets — Use environment variables
- Never use eval() — Or new Function() with user input
- Never trust user input — Always validate with Zod
- Never disable TypeScript strict mode — Even temporarily

Always Do These

- Validate all inputs — At system boundaries
- Sanitize outputs — Prevent XSS
- Use parameterized queries — Prevent SQL injection (Prisma does this)
- Set security headers — Use helmet for Express
- Keep dependencies updated — Security patches

## Self-Maintenance Tasks

Regular Codebase Health Checks
Periodically (or when asked), review and improve:

1. AGENTS.md files — Are they accurate? Concise? Helpful?
2. TypeScript strictness — Any any types that can be fixed?
3. Test coverage — Critical paths covered?
4. Dead code — Unused exports, unreachable code?
5. Dependency updates — Security vulnerabilities

When Starting a New Session
At the beginning of a new session, if context is unclear:

1. Read AGENTS.md at root
2. Check package.json scripts
3. Run pnpm test to verify environment works
4. Ask human for clarification on current task priorities

Continuous Improvement
When you notice recurring issues:

1. Fix the root cause — Not just the symptom
2. Add a test — Prevent regression
3. Update AGENTS.md — If it would help future sessions
4. Consider tooling — Can a linter catch this automatically?

# Quick Reference: File Templates

## New Package Checklist

When creating a new package:

1. Create directory: packages/<package-name>/
2. Create package.json with standard scripts
3. Create tsconfig.json extending base
4. Create src/index.ts for public exports
5. Create AGENTS.md with package-specific instructions
6. Add to pnpm-workspace.yaml if not auto-detected
7. Update root AGENTS.md with new package info
8. Run pnpm install to link workspace

## New Feature Checklist

When implementing a new feature:

1. Create types first (<feature>.types.ts)
2. Write failing tests (<feature>.test.ts)
3. Implement feature (<feature>.ts)
4. Ensure tests pass
5. Export from index.ts if public
6. Update AGENTS.md if feature adds new conventions

# Summary: The Agent-Ready Mindset

Every piece of code you write should answer these questions clearly:

1. What is this? → Clear naming, explicit types
2. Why does it exist? → Comments explaining decisions
3. How do I use it? → JSDoc with examples
4. How do I test it? → Colocated test files
5. Where does it fit? → Logical directory structure
6. What are the boundaries? → AGENTS.md restrictions

Write code as if you have amnesia and will return tomorrow with no memory. Because you do, and you will.
