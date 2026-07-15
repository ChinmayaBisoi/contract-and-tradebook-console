# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

RUN npm install -g bun@1.3.11

FROM base AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Development: Bun runtime, hot reload, full devDependencies
FROM deps AS development
WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=development
ENV PORT=3000
ENV WATCHPACK_POLLING=true

COPY . .
RUN bun run db:generate

EXPOSE 3000

CMD ["sh", "-c", "bun run db:generate && bun run dev -- -H 0.0.0.0 -p ${PORT}"]

# Production build: generate Prisma client and create Next.js standalone output
FROM deps AS builder
WORKDIR /app

ARG DATABASE_URL
ARG DIRECT_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
ENV DATABASE_URL=$DATABASE_URL
ENV DIRECT_URL=$DIRECT_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL
ENV NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY . .
RUN bun run db:generate
RUN node ./node_modules/next/dist/bin/next build

# Production: minimal Node runtime serving the standalone server
FROM node:22-alpine AS production
WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=80

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 80

CMD ["node", "server.js"]
