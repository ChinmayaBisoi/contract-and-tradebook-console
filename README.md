# ContractView

ContractView is a contract and tradebook operations console built with Next.js, Clerk, Prisma, tRPC, and Bun.

## Submission links

- GitHub repository: [https://github.com/ChinmayaBisoi/contract-and-tradebook-console](https://github.com/ChinmayaBisoi/contract-and-tradebook-console)
- Deployed application: [https://dwpz6oh9emnql.cloudfront.net](https://dwpz6oh9emnql.cloudfront.net)
- Public health check: [https://dwpz6oh9emnql.cloudfront.net/api/health](https://dwpz6oh9emnql.cloudfront.net/api/health)

The deployed CloudFront URL and health endpoint were rechecked on July 15, 2026.

## Evaluation access

- The repository is public. No GitHub access request is required.
- The deployed landing page and `/api/health` endpoint are public.
- Protected flows such as dashboard, organisation management, imports, export, and contract creation require signing in through Clerk.
- No shared evaluator credentials are checked into the repository. For a full end-to-end evaluation, use local development with your own `.env` values from `.env.example`.
- Sample evaluator assets are included at:
  - `sample_tradebook_xl.xlsx`
  - `sample_contract_text.txt`
  - `docs/contract-import-text-examples.md`

## Stack

- Next.js 16 App Router
- React 19
- Bun
- Clerk authentication
- Prisma 7
- PostgreSQL / Neon
- tRPC + TanStack Query
- UploadThing
- ExcelJS
- HyperFormula
- OpenAI Responses API

## Setup instructions

### 1. Install dependencies

```bash
bun install
```

### 2. Create environment file

```bash
cp .env.example .env
```

### 3. Start a database

Recommended local database:

```bash
bun run db:up
```

This starts Postgres on `localhost:5433` with:

- database: `contractview_dev`
- user: `contractview`
- password: `contractview`

Then run migrations:

```bash
bun run db:migrate
```

If you already have Postgres installed locally, point both `DATABASE_URL` and `DIRECT_URL` at that database instead.

### 4. Start the app

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.example` and fill in these values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Application runtime database connection. |
| `DIRECT_URL` | Yes for Prisma migrations | Direct database connection for Prisma schema and migration commands. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key for browser auth. |
| `CLERK_SECRET_KEY` | Yes | Clerk server-side secret key. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` | Yes | Redirect target after sign-in. Default is `/dashboard`. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Yes | Fallback redirect after sign-in. Default is `/dashboard`. |
| `LOG_LEVEL` | No | Logging threshold such as `debug`, `info`, `warn`, or `error`. |
| `UPLOADTHING_TOKEN` | Yes for workbook upload | UploadThing token for `.xlsx` uploads. |
| `UPLOADTHING_WORKBOOK_ACL` | No | Workbook ACL. Use `public-read` on UploadThing free tier for local dev; production should stay `private` or unset. |
| `OPENAI_API_KEY` | Optional | Enables AI column-mapping suggestions and AI contract extraction. |
| `OPENAI_MAPPING_MODEL` | Optional | Overrides the default OpenAI model used for mapping and extraction. Current fallback in code is `gpt-5-nano`. |

## Local development guide

### Recommended local flow

1. Run `bun install`.
2. Copy `.env.example` to `.env`.
3. Start Postgres with `bun run db:up`.
4. Run `bun run db:migrate`.
5. Start the app with `bun run dev`.
6. Sign in through Clerk.
7. Create or open an organisation.
8. Use the organisation Imports screen with `sample_tradebook_xl.xlsx`.
9. Use `sample_contract_text.txt` or `docs/contract-import-text-examples.md` in the contract text import flow.

### Quality checks

```bash
bun run test
bun run lint
bun run build
```

### Useful database commands

```bash
bun run db:generate
bun run db:studio
bun run db:down
```

## Excel import/export approach

### Libraries used

- `exceljs` for workbook read/write, sheet traversal, value capture, and export generation
- `hyperformula` for recalculating supported spreadsheet formulas after reviewer edits

### Import approach

The import path is review-first rather than auto-committing raw workbook rows:

1. The app creates an organisation-scoped upload record before the client upload begins.
2. UploadThing stores the original `.xlsx` workbook.
3. ExcelJS snapshots sheet order, header rows, values, dates, formulas, and cached formula results.
4. Deterministic mapping runs first against expected aliases for organisation, summary, and line-item sheets.
5. Reviewers confirm the source organisation, inspect mappings, and edit or discard invalid rows before commit.
6. The commit step writes contracts, line items, provenance links, and audit events in one transaction.

### Formula-handling strategy

- Formula text from the source workbook is preserved instead of being flattened away during import review.
- HyperFormula recalculates supported formulas after quantity or price edits so reviewers can see updated computed values.
- On export, ExcelJS writes a workbook that keeps formulas valid and uses explicit zero formulas where empty sections would otherwise produce broken references.

## AI workflow approach

### 1. Contract extraction

Contract extraction is optional and is enabled only when `OPENAI_API_KEY` is configured.

- The app sends contract text to the OpenAI Responses API.
- Responses are parsed into a strict Zod schema rather than accepted as free-form text.
- The system instruction limits the model to extracting facts present in the source text and explicitly tells it not to invent missing fields.
- Requests are sent with `store: false`.
- If the provider fails or the response does not validate, the app returns a controlled error and keeps manual entry available.

### 2. Column mapping

Column mapping uses a deterministic-first, AI-second approach:

- Exact and fuzzy header alias matching runs first across candidate workbook sheets.
- Only sheets missing required fields are included in the AI request.
- The AI request includes only:
  - sheet names
  - candidate headers
  - missing required fields
  - the first 10 sample rows for affected sheets
- The model returns structured suggestions with confidence and rationale.
- Suggestions are never auto-applied silently; the reviewer must accept them in the review workspace.
- If `OPENAI_API_KEY` is missing, manual mapping remains fully available.

## Deployment

The checked-in CI/CD workflow is `.github/workflows/deploy.yml`.

Production deployment shape:

- CloudFront public URL
- ALB origin
- ECS Fargate task
- Next.js standalone server
- Neon / PostgreSQL database

The deployment runbook lives in `docs/deployment-aws.md`.

## Sample evaluator assets

- `sample_tradebook_xl.xlsx`: multi-sheet tradebook workbook used for import and export verification
- `sample_contract_text.txt`: plain-text contract intake sample for the AI extraction flow
- `docs/contract-import-text-examples.md`: additional contract-text variations for manual evaluator testing

## Container workflow

Development container:

```bash
docker compose --profile dev up --build
```

Production image:

```bash
docker build --target production -t contract-tradebook-console .
docker run --rm --env-file .env -p 3000:3000 contract-tradebook-console
```

See `docs/containerization.md` for the full container notes.
