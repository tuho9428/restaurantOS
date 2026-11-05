# RestaurantOS

RestaurantOS is a Next.js App Router application for restaurant operations. The T002 foundation
contains a placeholder route and validated server environment boundary; product workflows are
implemented only in their dependency-ordered tasks.

## Local setup

Use Node.js 24.22.2 (`.nvmrc`) and npm. Copy `.env.example` to `.env.local`, then install and run:

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Local startup uses the fake Square mode and captured-email mode without requiring Square credentials.
Those modes and demo data are rejected when `APP_ENV=production`; no authentication bypass exists.

## Validation commands

```powershell
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:contracts
npm run test:e2e
npm run build
```

Set `APP_ENV=test` (or use `.env.local` copied above) before the build. The supported production
build uses Next.js webpack because Turbopack 16.4.5 fails to start its PostCSS worker on the
validated Windows host. The system sans stack avoids a build-time Google Fonts request.

The contract suite checks the server environment boundary; integration and browser suites are
scaffolded for later tasks. The Prisma migration
command becomes usable after T003 adds the first schema/migration. The worker command deliberately
exits with a clear not-implemented code until T011 adds the durable worker; it is not a placeholder
for background work in this task.

`APP_ENV` identifies the deployment trust boundary (`local`, `test`, `staging`, or `production`).
`NODE_ENV` is reserved for Node.js/Next.js build optimization and never controls whether unsafe
adapters are permitted. Do not commit `.env.local` or put real secret values in `.env.example`.
