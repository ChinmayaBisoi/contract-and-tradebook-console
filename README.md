# ContractView

Contract and tradebook operations console built with Next.js.

## Local Development

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Open `http://localhost:3000`.

## Environment

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

The app expects `DATABASE_URL` when Prisma is used at runtime. Excel imports
require a valid `UPLOADTHING_TOKEN`. Private workbook storage is the default
(`UPLOADTHING_WORKBOOK_ACL=private`, or unset). On UploadThing's free tier, set
`UPLOADTHING_WORKBOOK_ACL=public-read` in `.env` for local development.

`OPENAI_API_KEY` is optional. When configured, the review workspace can request
suggestions for required columns that deterministic aliases did not match. Set
`OPENAI_MAPPING_MODEL` to override the default `gpt-5-nano`. Without a key,
manual sheet and column mapping remains fully available.

## Excel Tradebook Imports

Open an organisation's **Imports** page and select one `.xlsx` workbook up to
32 MB. The workflow is review-first:

1. The app creates an organisation-scoped `Upload` record before requesting a
   client-side presigned upload.
2. UploadThing stores the original workbook privately. Server reads use a
   short-lived signed URL; the private source URL is never exposed as a public
   download.
3. ExcelJS snapshots sheet order, values, dates, formulas, and cached results.
   HyperFormula recalculates supported formulas after quantity or price edits
   without replacing the saved formula text.
4. Deterministic mappings run first. Optional AI receives only sheet names,
   candidate headers, and the first 10 rows, uses structured output with
   storage disabled, and produces suggestions that a user must accept.
5. The reviewer selects one workbook organisation, confirms mappings, edits or
   discards invalid rows, and saves sparse changes for server-side validation.
6. Commit creates contracts, line items, provenance links, audit events, and
   final statuses in one database transaction. Existing PO references are
   blocking errors and are never overwritten.

Parsing or unreadable-source failures mark the upload and import `FAILED`.
Retryable database failures leave a validated import `MAPPED`, so commit can be
retried safely. Repeating commit after a successful import returns the existing
terminal counts without creating duplicate records.

## Database

### Local PostgreSQL (Docker)

Start a local Postgres instance:

```bash
bun run db:up
```

The database is created automatically with:

| Setting  | Value            |
| -------- | ---------------- |
| Host     | `localhost`      |
| Port     | `5433` (mapped; avoids conflict with native Postgres on 5432) |
| Database | `contractview_dev` |
| User     | `contractview`   |
| Password | `contractview`   |

Point `.env` at local Postgres (comment out Neon URLs):

```env
DATABASE_URL=postgresql://contractview:contractview@localhost:5433/contractview_dev
DIRECT_URL=postgresql://contractview:contractview@localhost:5433/contractview_dev
```

Then run migrations:

```bash
bun run db:migrate
```

Stop Postgres:

```bash
bun run db:down
```

### Local PostgreSQL (native install)

If you already have Postgres via Homebrew or another install:

```bash
# Create role + database (run once)
psql postgres -c "CREATE USER contractview WITH PASSWORD 'contractview' CREATEDB;"
psql postgres -c "CREATE DATABASE contractview_dev OWNER contractview;"

# Or just create the database if your OS user already has access
createdb contractview_dev
```

Use the same `DATABASE_URL` / `DIRECT_URL` values as above.

### Prisma

Generate the Prisma client:

```bash
bun run db:generate
```

Run local migrations:

```bash
bun run db:migrate
```

Deploy migrations in production:

```bash
bun run db:deploy
```

## Quality Checks

Run unit tests:

```bash
bun run test
```

Run lint:

```bash
bun run lint
```

Run a production build:

```bash
bun run build
```

## Container

Development with hot reload:

```bash
docker compose --profile dev up --build
```

Production image:

```bash
docker build --target production -t contract-tradebook-console .
docker run --rm --env-file .env -p 3000:3000 contract-tradebook-console
```

Or run production with Docker Compose:

```bash
docker compose --profile prod up --build
```

See [docs/containerization.md](docs/containerization.md) for the full container workflow and operational notes.
