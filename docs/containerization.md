# Containerization

This guide explains how to build and run the application in Docker for local development and production.

## Prerequisites

- Docker Desktop or Docker Engine
- A valid `.env` file for runtime configuration
- Database migrations applied before serving production traffic

The image does not copy local `.env` files. Runtime secrets are supplied when the container starts.

## Dockerfile Targets

The Dockerfile defines two build targets:

| Target | Runtime | Purpose |
| --- | --- | --- |
| `development` | Bun | Hot reload, full devDependencies, Prisma client regeneration on start |
| `production` | Node 22 | Optimized standalone Next.js server for deployment |

`production` is the default final stage, so `docker build .` without `--target` builds the production image.

### Development stage

- Runs `next dev` with hot reload
- Binds to `0.0.0.0` so the app is reachable through Docker port mapping
- Enables `WATCHPACK_POLLING` for reliable file watching inside containers
- Regenerates the Prisma client on container start

### Production stage

Multi-stage build:

- installs dependencies with Bun
- generates the Prisma client
- builds Next.js with standalone output
- copies only the traced production server, static assets, and public assets into a small Node runtime image
- starts the standalone Next.js server with `node server.js`

## Development

### Build the development image

From the `my-app` directory:

```bash
docker build --target development -t contract-tradebook-console:dev .
```

### Run the development container

```bash
docker run --rm \
  --env-file .env \
  -p 3000:3000 \
  -v "$(pwd):/app" \
  -v app_dev_node_modules:/app/node_modules \
  contract-tradebook-console:dev
```

The source mount enables hot reload. The named volume keeps container `node_modules` separate from the host.

### Run development with Docker Compose

```bash
docker compose --profile dev up --build
```

Compose builds the `development` target, mounts the project directory, and exposes the app on port `3000`.

Open `http://localhost:3000`.

## Production

### Build the production image

```bash
docker build --target production -t contract-tradebook-console .
```

You can omit `--target production` because it is the default final stage.

### Run the production container

```bash
docker run --rm \
  --env-file .env \
  -p 3000:3000 \
  contract-tradebook-console
```

Open `http://localhost:3000`.

### Run production with Docker Compose

```bash
docker compose --profile prod up --build
```

Compose builds the `production` target, reads `.env`, and exposes the app on port `3000`.

## Database Notes

The application expects `DATABASE_URL` at runtime. Prisma migrations should be deployed as a separate release step before the production container receives traffic:

```bash
bun run db:deploy
```

Do not bake database credentials into the image. Pass them through the runtime environment or the deployment platform's secret manager.

For local development in Docker, apply migrations from the host or a one-off container before starting the app:

```bash
bun run db:migrate
```

## Operational Notes

- `NEXT_PUBLIC_*` values are evaluated at build time by Next.js. Rebuild the production image when those values change.
- Development mode reads source from the mounted project directory, so code changes do not require rebuilding the image.
- Dependency changes require rebuilding the development image or reinstalling packages inside the container.
- `HOSTNAME` defaults to `0.0.0.0` and `PORT` defaults to `3000`.
- Use the `production` target for AWS and other deployment platforms.
