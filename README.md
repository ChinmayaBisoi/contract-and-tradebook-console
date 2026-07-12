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

The app expects `DATABASE_URL` when Prisma is used at runtime.

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
