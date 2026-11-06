
# RestaurantOS — Codex Project Instructions

## Project purpose

RestaurantOS is a restaurant management application that complements Square Free and Square Plus. Square remains the system of record for POS payments and native restaurant checks. RestaurantOS manages inventory, recipe costing, purchasing, reservations, analytics, and other back-office operations as approved by the plan.

## Approved technology

- Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui.
- Prisma 7 with Neon PostgreSQL 18.
- Vercel for application hosting when deployment is authorized.
- Square API integration only within the approved task scope.
- Follow versions in `docs/DEPENDENCY_BASELINE.md`; do not upgrade casually.
- Keep the approved Webpack production build until a verified change is approved.

## Sources of truth

Read the relevant sections before changing code:

1. `docs/IMPLEMENTATION_TASKS.md` — task sequence and acceptance criteria.
2. `docs/ARCHITECTURE.md` — architecture and boundaries.
3. `docs/DATABASE.md` — schema, tenancy, migrations, and permissions.
4. `docs/API_CONTRACTS.md` — API shapes and errors.
5. `docs/TESTING.md` — verification requirements.
6. `docs/UI_DESIGN.md` — design system and frontend rules.
7. `docs/DEPENDENCY_BASELINE.md` — tested dependency versions.

If documents disagree with verified code or dependencies, report the conflict. Propose the smallest amendment. Never silently weaken acceptance criteria.

## Task execution

- Complete one approved implementation task at a time.
- Read the exact task scope, dependencies, and definition of done first.
- Keep changes minimal and preserve completed work.
- Do not implement later tasks or change the architecture without authorization.
- Leave the project runnable when possible.
- Report blockers, tests actually run, and any unverified requirements.
- Only mark a task complete after all acceptance criteria pass.
- Never claim a Git commit, deployment, or test result that did not occur.

## Database and security boundaries

- Neon `main` is reserved for production: do not connect to or modify it without explicit, specific authorization.
- `restaurantos-dev` is for development; `test_1` is for isolated test data; `restaurantos-shadow` is disposable and used only for Prisma shadow operations.
- Verify the intended environment and endpoint identity before database writes.
- Never reset development or production databases, or rewrite applied migrations.
- Preserve Prisma migrations 001–003 and subsequent committed migration history.
- Preserve provider-managed `neon_auth` objects and permissions.
- Runtime queries use restricted `restaurantos_runtime` credentials; migrations use separate privileged direct credentials.
- Runtime access must not acquire DDL or migration-history privileges.
- Audit records are insert-only for the runtime role.
- Database foreign keys do not replace tenant-scoped authorization checks.
- All staff-facing data access must enforce approved membership/location grants.
- Never print, commit, or expose `.env.local`, tokens, passwords, connection URLs, magic links, or personal customer information.
- Do not introduce `NEXT_PUBLIC_` variables containing secrets.
- Avoid unapproved real email sends and external transactions during tests.
- Do not perform Square payment actions or production deployments without approval.

## Authentication and integration quality

- Reuse the existing Auth.js Prisma adapter wrapper and database-backed sessions.
- Verify authentication, session expiry/revocation, and tenant authorization on the server, not only in browser components.
- Treat incoming Square webhooks as untrusted until signature verification passes.
- Make order imports idempotent and reconcile missed or duplicated events.
- Never assume Square exposes native POS table/check APIs that have not been verified.

## Frontend quality

- Prefer existing components and the approved UI design system.
- Taste Skill may guide design, but accessibility and operational usability win.
- Include empty, loading, error, success, and permission-denied states as needed.
- Prioritize clear tables, readable financial values, accessible forms, and mobile usability over decorative effects.

## Subagent workflow

- The regular Codex session is the lead implementation agent.
- `security_reviewer` performs independent read-only security reviews.
- `test_reviewer` performs independent read-only test and coverage reviews.
- Spawn both reviewers for security-sensitive milestones, particularly T005 Auth, T006 tenant authorization, Square synchronization, and preproduction checks.
- Skip multi-agent review for trivial edits unless specifically requested.
- Reviewers must not edit files, access secrets, run migrations, or deploy.
- Use `codex --sandbox read-only` for independent review sessions when practical; agent instructions alone do not enforce a read-only sandbox.
- Reviewers may work in parallel, but coding agents must not simultaneously edit overlapping files. Wait for reviewer results and consolidate duplicate findings.
- Do not accept a milestone with unresolved Critical or High review findings.

## Required validation

Use the scripts that actually exist in `package.json` and task-specific docs.

At minimum, when relevant, run:

- Lint and TypeScript checks.
- Formatting check.
- Unit and contract tests.
- PostgreSQL integration tests only on approved isolated test targets.
- Webpack production build.
- Prisma validate/generate and migration checks for database-related tasks.

Never count an empty test suite as coverage. For OS-level build issues such as Windows EPERM, report the root cause and any safe workaround used.

## Git and delivery

- Check `git status` and inspect staged changes before committing.
- Never add `.env.local`, generated Prisma Client output, or other secret files.
- Preserve reviewed, already-applied migrations unchanged.
- Commit only completed, validated task scope when authorized.
- End each task report with files changed, validation results, remaining risks, task PASS/FAIL status, and whether the next task is dependency-ready.
