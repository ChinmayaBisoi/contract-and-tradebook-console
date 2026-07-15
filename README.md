# ContractView

Contract and tradebook operations console built with Next.js, Clerk, Prisma,
and PostgreSQL. Live at
[dwpz6oh9emnql.cloudfront.net](https://dwpz6oh9emnql.cloudfront.net).

## Features

- Organisation dashboards, analytics, and team management
- Contract and line-item creation, editing, search, and export
- Excel tradebook upload, mapping, validation, and review
- Formula preservation with deterministic and optional AI-assisted mapping
- Role-based access, invitations, and membership controls
- Organisation audit trail and real-time updates

## User Permissions

Only active organisation members can access organisation data.

| Area | Owner | Admin | Member |
| --- | --- | --- | --- |
| Organisation | Full access | View | View |
| Members | Full access | Invite, view, change status | View |
| Invitations | Full access | View and update | No access |
| Contracts and line items | Create, update, view | Create, update, view | View |
| Imports | Create and view | Create and view | Create and view |
| Audit trail | View | View | View |

## Development Setup

Requires [Bun](https://bun.sh/) and Docker.

```bash
cp .env.example .env
bun install
bun run db:up
bun run db:migrate
bun run dev
```

Fill in the required Clerk and service credentials in `.env`, then open
`http://localhost:3000`.

```bash
bun run test
bun run lint
bun run build
```
