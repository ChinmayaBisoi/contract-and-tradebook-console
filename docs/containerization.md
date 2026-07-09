# Containerization

This guide explains how to build and run the application as a production Docker container.

## Prerequisites

- Docker Desktop or Docker Engine
- A valid `.env` file for runtime configuration
- Database migrations already applied before serving production traffic

The image does not copy local `.env` files. Runtime secrets are supplied when the container starts.

## Build The Image

From the `my-app` directory:

```bash
docker build -t contract-tradebook-console .
```

The Dockerfile uses a multi-stage build:

- installs dependencies with Bun
- generates the Prisma client
- builds Next.js with standalone output
- copies only the traced production server, static assets, and public assets into a small Node runtime image

## Run The Container

```bash
docker run --rm \
  --env-file .env \
  -p 3000:3000 \
  contract-tradebook-console
```

Open `http://localhost:3000`.

## Run With Docker Compose

```bash
docker compose up --build
```

Compose reads `.env`, builds the image, and exposes the application on port `3000`.

## Database Notes

The application expects `DATABASE_URL` at runtime. Prisma migrations should be deployed as a separate release step before the app container receives traffic:

```bash
bun run db:deploy
```

Do not bake database credentials into the image. Pass them through the runtime environment or the deployment platform's secret manager.

## Operational Notes

- `NEXT_PUBLIC_*` values are evaluated at build time by Next.js. Rebuild the image when those values change.
- The container starts the standalone Next.js server with `node server.js`.
- `HOSTNAME` defaults to `0.0.0.0` and `PORT` defaults to `3000`.
