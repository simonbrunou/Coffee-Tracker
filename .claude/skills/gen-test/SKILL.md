---
name: gen-test
description: Write a test for a module in Coffee-Tracker, matching the project's existing test style. Invoked as /gen-test <path-to-module>.
disable-model-invocation: true
---

# Generate a test

Default stack: **Vitest** + **@testing-library/react** for component tests. Tests live next to the code as `*.test.ts` / `*.test.tsx`. Run with `npx vitest run <path>`.

> **Match the house style first.** If existing tests use a different runner (Jest, `node:test`) or Playwright for e2e, read a sibling test and follow THAT over this default.

## Conventions (match existing tests)
- Import from `vitest`: `import { describe, it, expect, vi } from 'vitest';`
- Co-locate: `foo.ts` → `foo.test.ts`; components → `Foo.test.tsx` in the same directory.
- One `describe` per exported unit; concise `it('does X', ...)` cases.
- Cover the happy path **plus** null/undefined/empty and boundary inputs.
- React components: render with `@testing-library/react`, query by role/label (accessible queries), assert behavior — not implementation details.

## Database-touching modules (Drizzle + Postgres)
**Do not** hit the real dev database. Isolate:
- Prefer a **transaction per test, rolled back** in `afterEach`, or
- An ephemeral Postgres (Testcontainers), run migrations once, tear down after; or `pg-mem` for pure-logic cases.
- Keep slow DB tests out of the default unit run (a separate Vitest project or `*.db.test.ts` glob).

## Next.js Server Actions / Route Handlers (App Router)
- Test the underlying function directly where possible.
- Mock `next/headers`, `cookies()`, and auth with `vi.mock(...)`.
- **Always assert authorization is enforced** — that an unauthenticated or wrong-user caller is rejected (see the `security-reviewer` agent's checklist).

## Steps
1. Read the target module; list its exported functions and their edge cases.
2. Write the `*.test.ts(x)` following the conventions above.
3. Run `npx vitest run <path>` and iterate until green. Report the result.
