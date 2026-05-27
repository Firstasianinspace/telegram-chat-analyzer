# chat-analyzer

Telegram chat analysis app built with Vue 3 + TypeScript. Data is processed in the browser and stored in IndexedDB.

[Demo](https://chat-analyzer-drab.vercel.app)

## Current App Surface

Routes configured in `src/app/router.ts`:

- `/messages` - message table page
- `/charts` - analytics dashboard page
- `/service/calls` - service-message view filtered to `service` type
- `/settings` - settings page

## Current Feature State

- Upload Telegram JSON export from UI (`FileUploadCard`)
- Virtualized messages table (`MessageTableLazy` + TanStack Table/Virtual)
- Analytics charts (bar/line/scatter/doughnut via Chart.js + PrimeVue Chart)
- URL-synced analytics filter bar
- IndexedDB storage with derived fields and materialized aggregate tables
- Web Workers for JSON parsing and analytics/table query paths
- i18n dictionaries: English and Russian

## Tech Stack

From `package.json` dependencies and devDependencies:

- Vue 3, Vue Router 4, Pinia
- TypeScript, Vite, vue-tsc
- PrimeVue + PrimeIcons + PrimeVue Forms
- TanStack Vue Table, TanStack Vue Virtual, TanStack Vue Query
- Dexie (IndexedDB)
- Chart.js
- Vitest, Playwright, ESLint

## Quick Start

```bash
git clone https://github.com/Firstasianinspace/chatAnalyzer
cd chat-analyzer

# install
bun install
# or
pnpm install

# local env
cp .env.example .env.local

# run dev server
bun run dev
# or
pnpm dev
```

Open http://localhost:5173.

## Environment Variables

Current `.env.example` values:

- `VITE_API_URL`
- `VITE_FEATURE_FLAG`

## Available Scripts

From `package.json`:

- `dev` - run Vite dev server
- `build` - type-check (`vue-tsc --noEmit`) then production build
- `preview` - preview production build
- `lint` - lint `src` and `tests`
- `lint:fix` - auto-fix lint issues in `src` and `tests`
- `test` - run Vitest in watch mode
- `test:run` - run Vitest once
- `ci` - lint + unit tests + build

## Branching Rules (main-only)

This repository uses a main-only workflow with `main` as the integration and production branch.

### Branches

- `main` - production-ready history only
- `feature/<short-name>` - new feature work, created from `main`
- `release/<version>` - release stabilization, created from `main`
- `hotfix/<short-name>` - urgent production fix, created from `main`

### Lifecycle Rules

1. Never commit directly to `main`.
2. Create all normal work in `feature/*` from `main`.
3. Merge feature branches into `main` via Pull Request.
4. Cut `release/*` from `main` when preparing a release.
5. Merge `release/*` into `main` after release.
6. Create `hotfix/*` from `main` for urgent production fixes.
7. Merge `hotfix/*` into `main`.

### Naming Rules

- Branch names should be lowercase and kebab-case.
- Keep branch names short and descriptive.
- Examples: `feature/filter-bar-refactor`, `hotfix/service-calls-empty-state`.

### Pull Request Rules

1. Target `main` for all PRs (feature, release, hotfix).
2. Keep PRs small and scoped to one change.
3. Before opening PR, run:

```bash
bun run ci
# or
pnpm run ci
```

4. PR title format:

```text
type(scope): short summary
```

Examples:

- `feat(charts): add sender top N filter`
- `fix(table): correct timestamp sort on virtual rows`
- `chore(ci): align lint and test pipeline`

### Notes

- A `develop` branch is intentionally not used in this repository.

## Project Structure

```text
src/
  app/        app bootstrap, router, layout
  core/       cross-cutting config/database/services/utils
  modules/    feature modules (chat, phone-call)
  pages/      route components
  shared/     shared chart config, locales, style assets
tests/        unit/integration test setup
e2e/          Playwright tests
docs/         project documentation
```

## Docs Index

- `docs/README.md`
- `docs/architecture/README.md`
- `docs/MODULES.md`
- `docs/database/README.md`
