import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { handler } from "@/app/api/trpc/[trpc]/route";
import { makeQueryClient } from "@/trpc/query-client";
import { appRouter } from "@/trpc/routers/_app";

describe("tRPC setup", () => {
  it("exposes a Zod-validated hello procedure", async () => {
    const caller = appRouter.createCaller({ headers: new Headers() });

    await expect(caller.hello({ text: "ContractView" })).resolves.toEqual({
      greeting: "hello ContractView",
    });
    await expect(
      caller.hello({ text: 123 } as unknown as { text: string }),
    ).rejects.toThrow();
  });

  it("lists organisations for the authenticated user", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "org_1",
        name: "Contract Ops",
        description: "Contract review workspace",
        createdAt: new Date("2026-07-10T00:00:00.000Z"),
        updatedAt: new Date("2026-07-10T00:00:00.000Z"),
        users: [{ role: "OWNER", status: "ACTIVE" }],
      },
    ]);
    const caller = appRouter.createCaller({
      headers: new Headers(),
      auth: {
        clerkUserId: "user_1",
        email: "owner@example.com",
        name: "Owner User",
      },
      db: {
        organisation: {
          findMany,
        },
      },
    });

    await expect(caller.organisation.listForCurrentUser()).resolves.toEqual([
      {
        id: "org_1",
        name: "Contract Ops",
        description: "Contract review workspace",
        role: "OWNER",
        status: "ACTIVE",
        createdAt: new Date("2026-07-10T00:00:00.000Z"),
        updatedAt: new Date("2026-07-10T00:00:00.000Z"),
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        users: {
          select: {
            role: true,
            status: true,
          },
          where: {
            clerkUserId: "user_1",
          },
        },
      },
      where: {
        users: {
          some: {
            clerkUserId: "user_1",
            status: "ACTIVE",
          },
        },
      },
    });
  });

  it("lists organisations with server-driven filters, sorting, and pagination", async () => {
    const createdAt = new Date("2026-07-10T00:00:00.000Z");
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "org_2",
        name: "Operations Group",
        description: null,
        createdAt,
        updatedAt: createdAt,
        users: [{ role: "ADMIN", status: "ACTIVE" }],
        _count: { users: 4 },
      },
    ]);
    const count = vi.fn().mockResolvedValue(13);
    const caller = appRouter.createCaller({
      headers: new Headers(),
      auth: {
        clerkUserId: "user_admin",
        email: "admin@example.com",
        name: "Admin User",
      },
      db: { organisation: { findMany, count } },
    });

    await expect(
      caller.organisation.list({
        filters: { search: "operations", role: "ADMIN" },
        page: 2,
        pageSize: 10,
        sort: "name",
        sortDirection: "asc",
      }),
    ).resolves.toEqual({
      data: [
        {
          id: "org_2",
          name: "Operations Group",
          description: null,
          role: "ADMIN",
          status: "ACTIVE",
          activeMemberCount: 4,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      pagination: { page: 2, pageSize: 10, total: 13, pageCount: 2 },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: { name: "asc" },
        where: {
          name: { contains: "operations", mode: "insensitive" },
          users: {
            some: {
              clerkUserId: "user_admin",
              role: "ADMIN",
              status: "ACTIVE",
            },
          },
        },
      }),
    );
  });

  it("prevents disabling the final active owner", async () => {
    const update = vi.fn();
    const caller = appRouter.createCaller({
      headers: new Headers(),
      auth: {
        clerkUserId: "owner_1",
        email: "owner@example.com",
        name: "Owner User",
      },
      db: {
        organisationUser: {
          findUnique: vi.fn().mockResolvedValue({
            role: "OWNER",
            status: "ACTIVE",
          }),
          count: vi.fn().mockResolvedValue(1),
          update,
        },
      },
    });

    await expect(
      caller.organisation.updateMemberStatus({
        organisationId: "org_1",
        clerkUserId: "owner_1",
        status: "DISABLED",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "An organisation must keep at least one active owner.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("creates a TanStack Query client with SSR-friendly defaults", () => {
    const queryClient = makeQueryClient();

    expect(queryClient).toBeInstanceOf(QueryClient);
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it("serves the hello procedure through the App Router fetch handler", async () => {
    const input = encodeURIComponent(JSON.stringify({ text: "operations" }));
    const request = new Request(
      `http://localhost/api/trpc/hello?input=${input}`,
    );

    const response = await handler(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.data).toEqual({
      greeting: "hello operations",
    });
  });
});
