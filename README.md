# Contract And Tradebook Operations Console

A Next.js application for contract and tradebook operations workflows.

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

Build the Docker image:

```bash
docker build -t contract-tradebook-console .
```

Run the image:

```bash
docker run --rm --env-file .env -p 3000:3000 contract-tradebook-console
```

Or use Docker Compose:

```bash
docker compose up --build
```

See [docs/containerization.md](docs/containerization.md) for the full container workflow and operational notes.
