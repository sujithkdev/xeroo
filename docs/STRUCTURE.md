# Project structure

This repository is one npm project with a Next.js website and two Electron entry points. Run all npm commands from the repository root.

| Location | Responsibility |
| --- | --- |
| `src/app/(customer)/` | Customer storefront and ordering routes |
| `src/app/shop/` | Shop staff and owner workspace |
| `src/app/admin/` | Platform administration; retained for future work |
| `src/app/api/` | HTTP endpoints and authorization boundaries |
| `src/components/` | Shared interface components |
| `src/lib/` | Business logic, storage, authentication, and integrations |
| `src/proxy.ts` | Request routing and tenancy |
| `electron/` | Connected desktop shell and optional offline counter shell |
| `agent/`, `print-agent.js` | Printing runtime shared by desktop editions |
| `public/` | Public web assets; never store credentials here |
| `migrations/` | Ordered database schema migrations |
| `scripts/` | Setup, build, database, backup, and maintenance commands |
| `tests/` | Automated test runners and fixtures |
| `deploy/` | Deployment configuration and operator instructions |
| `docs/operations/` | Onboarding, retention, and verification guides |
| `docs/history/` | Historical implementation notes; not current deployment instructions |
| `.github/workflows/` | Continuous integration |

Framework configuration, npm manifests, Windows launchers, Dockerfile, and environment files stay at the root because tools and existing deployment commands resolve them there. SumatraPDF.exe remains at the packaging path expected by Electron.

## Generated output and private state

`.build/`, `.counter-build/`, `.counter-stage/`, `.desktop-app/`, `dist-electron/`, and `dist-counter/` are generated output. Do not edit them as source or remove output used by a running server.

`data/`, `backups/`, `.env*`, and `.test-data/` are private local state. Despite its name, `.test-data/multishop` currently holds shop data, and `.test-data/public-shop-relay.cjs` supports temporary hosting. Do not relocate these without migrating configuration and validating the running deployment. The dated cleanup archive is inside `backups/`.

## Change boundaries

Keep authorization on the server; hiding owner/admin navigation is not authorization. Preserve the owner/admin routes while their product work is paused. Keep Electron connection and printing code separate from customer UI. Add tests under `tests/`, maintenance commands under `scripts/`, and operational instructions under `docs/operations/`. Do not add a new workspace package until it has an independently managed build and dependency boundary.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm run test:desktop`, `npm run test:scheduling`, and `npm run test:collections` for routine checks. Integration tests may require a production build or an isolated PostgreSQL database; consult the workflow and test scripts before running them. Never point integration tests at the live shop database.

Organization alone is not production certification. Deployment still needs verified secrets, backups and restore, authentication, payment reconciliation, printing recovery, and a stable HTTPS endpoint.
