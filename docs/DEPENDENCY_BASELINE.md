# RestaurantOS dependency and external-evidence baseline

**Baseline date:** 2026-11-04 America/Los_Angeles (2026-11-05 UTC)  
**Task:** T001  
**Decision:** Use exact versions below; create `package-lock.json` with `--save-exact` during T002. This is a verified metadata/release compatibility review, not an installed or built application. Re-run package compatibility checks before T002 if implementation begins after this baseline or a security advisory changes a pin.

## Compatibility decisions

- Use Node.js 24.22.2, the Node 24 LTS line. It exceeds Next.js 16, Prisma ORM 7, Vitest 5, Vite 8, shadcn CLI, and Playwright minimums. Pin this runtime in the container/deployment image and `.nvmrc`; do not use a floating `latest` runtime tag.
- Use Next.js 16.4.5 with React and React DOM 19.3.0. Next's declared peers accept React 19; React DOM 19.3 requires React `^19.3.0`. Next.js 16 is Active LTS.
- Use Auth.js for Next.js (`next-auth@5.0.0-beta.32`) with `@auth/prisma-adapter@2.11.3`. Auth.js v5 remains a prerelease; v4 is maintenance-only, while the current official Auth.js docs and adapter instructions use v5. The beta's declared Next/React peers include the selected versions. The Prisma adapter's published peer range includes `@prisma/client@7`; its adapter schema and database-session behavior still require T005 integration verification. Do not silently substitute v4 or another adapter.
- Use Prisma ORM 7.10.1 (`prisma` CLI and `@prisma/client`) with `@prisma/adapter-pg@7.10.1` and `pg@8.23.1`. Prisma 8 is still a release candidate in the official release-status page at baseline time; Prisma 7 remains supported. Prisma 7 requires a driver adapter for direct connections and ESM configuration. T002 uses `type: module` and installs Prisma without a schema or generated client. T003 creates the schema, custom generated-client output, and separate direct migration versus pooled runtime connection settings as specified by the architecture/database plan. T003 sets and tests finite `pg` pool/acquire timeouts; Prisma 7 driver defaults differ from Prisma 6.
- Use Zod 4.6.7 for shared runtime contracts. Keep schemas browser-safe and avoid importing server modules from contracts.
- Use Tailwind CSS 4.3.4 with its matching `@tailwindcss/postcss@4.3.4` and PostCSS 8.5.32. Use `shadcn@4.23.0` only as a pinned component-generation CLI; shadcn components are owned source in this app, not a runtime framework. Generated primitives and their direct dependencies are committed and lockfile-pinned.
- Use Vitest 5.1.0 with Vite 8.3.5. Vitest 5.1 requires Vite 8.2.1 or newer and Node 22.12 or newer; the selected versions meet that boundary. Vite is a test/build tool only and does not replace Next.js.
- Use `@playwright/test@1.64.1` for browser tests. Next.js declares a compatible Playwright peer range; install the matching browser binaries in CI and record the browser revision from the lockfile/tool install.
- Use TypeScript 6.0.3, React type packages 19.3.0, and Node type package 24.19.2. Prisma 7 requires TypeScript 5.4 or later; `eslint-config-next@16.4.5` accepts TypeScript 3.3.1 or later. Strict type checking is required. Do not adopt a TypeScript 7 prerelease as part of this baseline.
- Use ESLint 9.39.5 with `eslint-config-next@16.4.5`. The Next config direct peer accepts ESLint 10, but its installed import, accessibility, and React plugins accept ESLint only through 9. The 9.39.5 pin satisfies the full installed peer tree. Keep lint config flat.
- Use Prettier 3.9.10 for a separate formatter config/check; it has no runtime role and does not replace ESLint.
- Use PostgreSQL major version 17, including the `btree_gist` extension. Keep local and CI images on the latest patched PostgreSQL 17 image and pin the image digest when T003 creates Compose; confirm the managed production provider grants extension installation. No compatibility claim is made for other majors.
- Keep Square pinned to `square@46.0.0` and API version `2026-09-16`. The SDK release pairs with this API version. Square account entitlement, POS event coverage, Free/Plus device workflows, and payload semantics still require the explicit sandbox/merchant gates T066/T067; package metadata does not prove those capabilities.
- Keep Taste Skill at v2.1.5 commit `12af471f627f866411b4bd785b19646d3672784c` as recorded in [UI_DESIGN](UI_DESIGN.md). Never resolve a moving `main` branch for implementation. The ancillary `colour.md` reference was unavailable during planning review; its content is not inferred or claimed as verified. Recheck the pinned source at T008/T062 and record any changed availability without changing the pinned commit implicitly.

## Exact toolchain pins

Versions are exact (no `^`, `~`, or `latest`) and were present in the npm registry by the baseline date. License values and peer/engine ranges below are the registry package metadata values reviewed for the listed packages; transitive package license inventory is generated from the committed lockfile at T002 and scanned again at T060.

| Package | Exact version | Placement | License | Compatibility evidence / note |
| --- | --- | --- | --- | --- |
| `next` | `16.4.5` | runtime | MIT | `node >=20.9.0`; React/React DOM peers accept `^19.0.0`; compatible Playwright peer `^1.51.1`; 16.x Active LTS. |
| `react` | `19.3.0` | runtime | MIT | React 19.3 release; selected by Next's peer range. |
| `react-dom` | `19.3.0` | runtime | MIT | Peer requires React `^19.3.0`. |
| `next-auth` | `5.0.0-beta.32` | runtime | ISC | Auth.js v5 prerelease; peers include Next `^16.0.0` and React `^19.0.0`. |
| `@auth/prisma-adapter` | `2.11.3` | runtime | ISC | Auth.js documents this adapter for its Next.js v5 API; Prisma peer range includes v7. |
| `@prisma/client` | `7.10.1` | runtime | Apache-2.0 | Paired at the same exact release as Prisma CLI and PostgreSQL adapter. |
| `@prisma/adapter-pg` | `7.10.1` | runtime | Apache-2.0 | Official Prisma PostgreSQL adapter; depends on `pg ^8.16.3`, matching `pg@8.23.1`. |
| `pg` | `8.23.1` | runtime | MIT | Node driver used by the Prisma adapter. |
| `zod` | `4.6.7` | runtime | MIT | Shared runtime validation. |
| `prisma` | `7.10.1` | development/CI | Apache-2.0 | Node `^20.19 || ^22.12 || >=24`; TypeScript `>=5.4`. Use the 7.x CLI explicitly. |
| `typescript` | `6.0.3` | development/CI | Apache-2.0 | Compatible with Prisma 7 minimum and Next config peer; strict mode. |
| `@types/react` | `19.3.0` | development/CI | MIT | Matches React 19.3. |
| `@types/react-dom` | `19.3.0` | development/CI | MIT | Peer requires `@types/react ^19.3.0`. |
| `@types/node` | `24.19.2` | development/CI | MIT | Matches Node 24 runtime line. |
| `tailwindcss` | `4.3.4` | development/CI | MIT | Tailwind v4; use its CSS-first configuration. |
| `@tailwindcss/postcss` | `4.3.4` | development/CI | MIT | Exact version match with Tailwind; depends on PostCSS `^8.5.25`. |
| `postcss` | `8.5.32` | development/CI | MIT | Meets Tailwind's PostCSS dependency range. |
| `shadcn` | `4.23.0` | development/CI | MIT | CLI only; Node `>=20.18.1`; generated code stays in owned component paths. |
| `vitest` | `5.1.0` | development/CI | MIT | Node `^22.12 || ^24 || >=26`; Vite peer includes `^8.0.0`. |
| `vite` | `8.3.5` | development/CI | MIT | Node `^20.19 || >=22.12`; explicit Vitest peer. |
| `@playwright/test` | `1.64.1` | development/CI | Apache-2.0 | Node `>=20`; Next peer range includes this version. Record the browser revision resolved by the locked Playwright package and install output. |
| `eslint` | `9.39.5` | development/CI | MIT | Compatible with Next config and its installed plugin peers; ESLint 9 is on npm's maintenance line. |
| `eslint-config-next` | `16.4.5` | development/CI | MIT | Keep same release line as Next.js; TypeScript peer `>=3.3.1`. |
| `prettier` | `3.9.10` | development/CI | MIT | Formatter only; configuration is committed and checkable through the package script. |
| `square` | `46.0.0` | runtime | MIT | Pinned official Node SDK; API version `2026-09-16` is fixed separately in Square configuration. |

Registry metadata is reproducible with `npm view <package>@<version> version engines peerDependencies license --json`. Selected publication timestamps were checked with the npm `time` metadata. Versions above are deliberately exact even when compatible peers are expressed as ranges.

## Reproducible install commands for T002

Run only when T002 begins; T001 did not install dependencies or create a manifest/lockfile.

Set `"type": "module"` in `package.json`, then run:

```powershell
npm install --save-exact next@16.4.5 react@19.3.0 react-dom@19.3.0 next-auth@5.0.0-beta.32 @auth/prisma-adapter@2.11.3 @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 pg@8.23.1 zod@4.6.7 square@46.0.0
npm install --save-dev --save-exact prisma@7.10.1 typescript@6.0.3 @types/react@19.3.0 @types/react-dom@19.3.0 @types/node@24.19.2 tailwindcss@4.3.4 @tailwindcss/postcss@4.3.4 postcss@8.5.32 shadcn@4.23.0 vitest@5.1.0 vite@8.3.5 @playwright/test@1.64.1 eslint@9.39.5 eslint-config-next@16.4.5 prettier@3.9.10
npm ci
```

T002 must inspect the resulting lockfile for peer-resolution warnings, run the application build without Prisma generation, and record the exact Node/npm versions and all commands. T003 generates Prisma Client after creating the first valid schema. The second clean `npm ci` verifies that the generated lockfile reproduces the install. Do not add `--legacy-peer-deps` or force peer overrides to hide a conflict. If package metadata or a clean T002 install disagrees with this matrix, stop and amend this baseline/task plan before continuing. Auth.js v5 beta and the Prisma adapter schema are the highest compatibility risk. Installing an exact version does not replace database-session, SMTP, migration, and login E2E checks in T005.

### T002 verified compatibility resolution

The installed Next config plugins reject ESLint 10 but accept exact ESLint 9.39.5. After updating the lockfile, `npm install --no-audit --no-fund`, clean `npm ci --no-audit --no-fund`, and `npm ls --all` completed without peer errors. ESLint 9.39.5 is currently on npm's maintenance line; reassess when the full plugin tree supports ESLint 10.

T002 has no Prisma schema and does not generate or import a Prisma Client. T003 owns the initial schema, generation, and migration. `npm run build` uses `next build --webpack` until the Next 16.4.5 Turbopack PostCSS worker startup failure on Windows is resolved. The full panic log reports `creating new process` and `node process exited before we could connect to it with exit code: 0`; the same failure occurred outside the sandbox, while webpack built the same CSS and route. T002 uses a system sans stack so builds do not fetch Google Fonts. With `APP_ENV=test`, the clean-install build passed on Node 24.14.1/npm 11.17.0; the deployment pin remains Node 24.22.2 and needs CI confirmation on that exact patch.

## External evidence and verification gates

| Area | Evidence reviewed | Confirmed by evidence | Still requires implementation or live verification |
| --- | --- | --- | --- |
| Next.js and React | [Next.js support policy](https://nextjs.org/support-policy), [Next.js 16.2 release notes](https://nextjs.org/blog/next-16-2), [React 19.3 release](https://react.dev/blog/2026/09/09/react-19-3), npm metadata | Next 16 active LTS; selected Next release supports selected React 19 peers. | Fresh project install/build, production behavior, and no browser import of server code: T002/T060. |
| TypeScript and Node | [TypeScript 6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html), [Node 24.22.2 release](https://nodejs.org/en/blog/release/v24.22.2), package metadata | Selected compiler is supported by Prisma's declared minimum; Node 24 is LTS and satisfies tool engines. | CI/deployment image pin and actual typecheck/build: T002. |
| Auth.js | [Auth.js Next.js installation](https://authjs.dev/getting-started/installation?framework=Next.js), [Prisma adapter guide](https://authjs.dev/getting-started/adapters/prisma), [v5 migration guide](https://authjs.dev/getting-started/migrating-to-v5?authentication-method=middleware), package metadata | Official v5 uses `next-auth@beta` and `@auth/prisma-adapter`; selected peer ranges accept Next 16/React 19. | Beta API/database schema compatibility, invite-only email provider, 15-minute link, single use, session expiry/revocation, and CSRF behavior: T002/T005/T007. |
| Prisma/PostgreSQL | [Prisma ORM release status](https://www.prisma.io/docs/orm/release-status), [Prisma v7 database drivers](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers), [v7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [PostgreSQL 17 docs](https://www.postgresql.org/docs/17/), package metadata | Prisma 8 is RC at the queried time; v7 supported. v7 direct connections require a driver adapter and ESM; adapter officially supports `pg`. | Prisma generate/migration and custom SQL validation; actual `btree_gist` provider privilege; runtime pool settings and separate direct migration URL: T003. |
| Tailwind and shadcn | [Tailwind Next.js installation](https://tailwindcss.com/docs/installation/framework-guides/nextjs), shadcn package metadata | Matching Tailwind/PostCSS versions are compatible; shadcn is an owned-code generator. | Confirm generated primitives and selected Radix/icon packages under actual build and accessibility checks: T002/T008/T062. |
| Vitest and Playwright | [Vitest 5.1 release](https://vitest.dev/blog/vitest-5-1), [Vitest setup requirements](https://vitest.dev/guide/), package metadata | Node/Vite peer floors are met; Playwright supports Node 24. | Browser download, PostgreSQL-backed suites, actual test configuration and CI execution: T002/T010. |
| Square | [Square SDK release 46.0.0](https://github.com/square/square-nodejs-sdk/releases/tag/46.0.0), [Square Node SDK guide](https://developer.squareup.com/docs/sdks/nodejs), [Square API versioning](https://developer.squareup.com/docs/build-basics/versioning) | The plan's SDK/API-version pair is fixed; SDK constructor/endpoint usage must follow the v40+ API. | Sandbox request payloads, events, account access, Square Free/Plus entitlements and physical POS/device flows: T013/T066/T067. Never treat metadata or mocks as proof. |
| Taste Skill | [Pinned v2.1.5 release](https://github.com/Leonxlnx/taste-skill/releases/tag/v2.1.5), [pinned commit](https://github.com/Leonxlnx/taste-skill/commit/12af471f627f866411b4bd785b19646d3672784c), [UI design workflow](UI_DESIGN.md) | Stable commit remains the design-method source; mutable main is excluded. | Recheck source availability at implementation; `colour.md` was unavailable in the planning fetch and remains unverified. Browser-tool requirements and protected-route authenticated inspection: T008/T062. |

## Verification record and T001 status

- **Status: COMPLETE.** The checklist task has no code-build/lint/typecheck obligation; its required tests are official package metadata, engine/peer/license, release and documented SDK/API compatibility review. Those checks were run against npm registry metadata and official maintainer documentation on the baseline date.
- **Application install/build, Prisma generation, migrations, lint, typecheck, unit/integration/E2E, and Square sandbox calls: NOT RUN.** At T001 review, the repository had no application manifest or code, and the task explicitly assigns installation/build to T002 and generation to T003 and live Square verification to T066/T067. Do not represent the metadata check as a successful application build.
- **External risk:** Auth.js v5 is a beta; Prisma ORM 8 is not selected while it is an RC; actual Square account/device compatibility and the missing Taste `colour.md` remain disclosed gates.
- **Files changed for T001:** `docs/DEPENDENCY_BASELINE.md`, `docs/IMPLEMENTATION_TASKS.md`, `docs/ARCHITECTURE.md`, `docs/UI_DESIGN.md`.
