import { describe, expect, it, vi } from "vitest";

import { appRouter } from "@/trpc/routers/_app";

const ownerAuth = {
  clerkUserId: "owner_1",
  email: "owner@example.com",
  name: "Owner User",
};

function createCaller(db: Record<string, unknown>, auth = ownerAuth) {
  return appRouter.createCaller({ headers: new Headers(), auth, db });
}

function activeMembership(role: "OWNER" | "ADMIN" | "MEMBER" = "OWNER") {
  return { role, status: "ACTIVE" } as const;
}

const removedMembership = { role: "MEMBER", status: "REMOVED" } as const;

describe("organisation details router", () => {
  it("returns organisation analytics to active members using scoped counts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
    const createdAt = new Date("2026-07-01T00:00:00.000Z");
    const memberCount = vi
      .fn()
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2);
    const invitationCount = vi.fn().mockResolvedValue(3);
    const caller = createCaller(
      {
        organisation: {
          findUnique: vi.fn().mockResolvedValue({ createdAt }),
        },
        organisationUser: {
          findUnique: vi.fn().mockResolvedValue(activeMembership("MEMBER")),
          count: memberCount,
        },
        invitation: { count: invitationCount },
      },
      {
        clerkUserId: "member_1",
        email: "member@example.com",
        name: "Member User",
      },
    );

    const result = await caller.organisation.getAnalytics({
      organisationId: "org_1",
    });

    expect(result).toMatchObject({
      activeMemberCount: 6,
      disabledMemberCount: 2,
      pendingInvitationCount: 3,
      createdAt,
    });
    expect(result.ageInDays).toBe(14);
    expect(memberCount).toHaveBeenNthCalledWith(1, {
      where: { organisationId: "org_1", status: "ACTIVE" },
    });
    expect(memberCount).toHaveBeenNthCalledWith(2, {
      where: { organisationId: "org_1", status: "DISABLED" },
    });
    expect(invitationCount).toHaveBeenCalledWith({
      where: {
        organisationId: "org_1",
        status: "PENDING",
        expiresAt: { gt: expect.any(Date) },
      },
    });
    vi.useRealTimers();
  });

  it("lists organisation members with scoped filters, paging, and owner actions", async () => {
    const createdAt = new Date("2026-07-10T00:00:00.000Z");
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "membership_1",
        clerkUserId: "member_1",
        clerkUserName: "Taylor Member",
        clerkUserEmail: "taylor@example.com",
        role: "MEMBER",
        status: "ACTIVE",
        createdAt,
        updatedAt: createdAt,
      },
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
        findMany,
        count,
      },
    });

    const result = await caller.organisation.listMembers({
      organisationId: "org_1",
      filters: { search: "taylor", role: "MEMBER", status: "ACTIVE" },
      page: 2,
      pageSize: 20,
      sort: "clerkUserName",
      sortDirection: "asc",
    });

    const where = {
      organisationId: "org_1",
      role: "MEMBER",
      status: "ACTIVE",
      OR: [
        { clerkUserName: { contains: "taylor", mode: "insensitive" } },
        { clerkUserEmail: { contains: "taylor", mode: "insensitive" } },
      ],
    };
    expect(findMany).toHaveBeenCalledWith({
      where,
      skip: 20,
      take: 20,
      orderBy: { clerkUserName: "asc" },
      select: {
        id: true,
        clerkUserId: true,
        clerkUserName: true,
        clerkUserEmail: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          clerkUserId: "member_1",
          canChangeRole: true,
          canChangeStatus: true,
          canRemove: true,
        }),
      ],
      pagination: { page: 2, pageSize: 20, total: 1, pageCount: 1 },
    });
  });

  it("gives administrators status actions only for ordinary members", async () => {
    const now = new Date("2026-07-10T00:00:00.000Z");
    const caller = createCaller(
      {
        organisationUser: {
          findUnique: vi.fn().mockResolvedValue(activeMembership("ADMIN")),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "owner_membership",
              clerkUserId: "owner_1",
              clerkUserName: "Owner User",
              clerkUserEmail: "owner@example.com",
              role: "OWNER",
              status: "ACTIVE",
              createdAt: now,
              updatedAt: now,
            },
            {
              id: "member_membership",
              clerkUserId: "member_1",
              clerkUserName: "Member User",
              clerkUserEmail: "member@example.com",
              role: "MEMBER",
              status: "ACTIVE",
              createdAt: now,
              updatedAt: now,
            },
          ]),
          count: vi.fn().mockResolvedValue(2),
        },
      },
      {
        clerkUserId: "admin_1",
        email: "admin@example.com",
        name: "Admin User",
      },
    );

    const result = await caller.organisation.listMembers({
      organisationId: "org_1",
      page: 1,
      pageSize: 10,
      sort: "createdAt",
      sortDirection: "desc",
    });

    expect(result.data[0]).toMatchObject({
      role: "OWNER",
      canChangeRole: false,
      canChangeStatus: false,
      canRemove: false,
    });
    expect(result.data[1]).toMatchObject({
      role: "MEMBER",
      canChangeRole: false,
      canChangeStatus: true,
      canRemove: false,
    });
  });

  it("hides owner actions for the last active owner and removed members", async () => {
    const now = new Date("2026-07-10T00:00:00.000Z");
    const count = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "owner_membership",
            clerkUserId: "owner_1",
            clerkUserName: "Owner User",
            clerkUserEmail: "owner@example.com",
            role: "OWNER",
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "removed_membership",
            clerkUserId: "removed_1",
            clerkUserName: "Removed User",
            clerkUserEmail: "removed@example.com",
            role: "MEMBER",
            status: "REMOVED",
            createdAt: now,
            updatedAt: now,
          },
        ]),
        count,
      },
    });

    const result = await caller.organisation.listMembers({
      organisationId: "org_1",
      page: 1,
      pageSize: 10,
      sort: "createdAt",
      sortDirection: "desc",
    });

    expect(count).toHaveBeenCalledWith({
      where: {
        organisationId: "org_1",
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    expect(result.data[0]).toMatchObject({
      role: "OWNER",
      status: "ACTIVE",
      canChangeRole: false,
      canChangeStatus: false,
      canRemove: false,
    });
    expect(result.data[1]).toMatchObject({
      status: "REMOVED",
      canChangeRole: false,
      canChangeStatus: false,
      canRemove: false,
    });
  });

  it("uses active owners outside the current page when deriving owner actions", async () => {
    const now = new Date("2026-07-10T00:00:00.000Z");
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "owner_membership",
            clerkUserId: "owner_1",
            clerkUserName: "Owner User",
            clerkUserEmail: "owner@example.com",
            role: "OWNER",
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
          },
        ]),
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
      },
    });

    const result = await caller.organisation.listMembers({
      organisationId: "org_1",
      page: 1,
      pageSize: 10,
      sort: "createdAt",
      sortDirection: "desc",
    });

    expect(result.data[0]).toMatchObject({
      role: "OWNER",
      canChangeRole: true,
      canChangeStatus: true,
      canRemove: true,
    });
  });

  it("keeps member viewers read-only for ordinary member rows", async () => {
    const now = new Date("2026-07-10T00:00:00.000Z");
    const caller = createCaller(
      {
        organisationUser: {
          findUnique: vi.fn().mockResolvedValue(activeMembership("MEMBER")),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "member_membership",
              clerkUserId: "member_1",
              clerkUserName: "Member User",
              clerkUserEmail: "member@example.com",
              role: "MEMBER",
              status: "ACTIVE",
              createdAt: now,
              updatedAt: now,
            },
          ]),
          count: vi.fn().mockResolvedValue(1),
        },
      },
      {
        clerkUserId: "member_2",
        email: "member2@example.com",
        name: "Second Member",
      },
    );

    const result = await caller.organisation.listMembers({
      organisationId: "org_1",
      page: 1,
      pageSize: 10,
      sort: "createdAt",
      sortDirection: "desc",
    });

    expect(result.data[0]).toMatchObject({
      role: "MEMBER",
      canChangeRole: false,
      canChangeStatus: false,
      canRemove: false,
    });
  });

  it("lets owners change member roles", async () => {
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const update = vi.fn().mockResolvedValue({
      id: "membership_1",
      clerkUserId: "member_1",
      clerkUserName: "Member User",
      clerkUserEmail: "member@example.com",
      status: "ACTIVE",
      role: "ADMIN",
    });
    const tx = {
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "membership_1",
          clerkUserId: "member_1",
          clerkUserName: "Member User",
          clerkUserEmail: "member@example.com",
          ...activeMembership("MEMBER"),
        }),
        count: vi.fn(),
        update,
      },
      auditEvent: { create: auditCreate },
    };
    const transaction = vi.fn(
      async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
    );
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
      },
      $transaction: transaction,
    });

    await expect(
      caller.organisation.updateMemberRole({
        organisationId: "org_1",
        clerkUserId: "member_1",
        role: "ADMIN",
      }),
    ).resolves.toMatchObject({ clerkUserId: "member_1", role: "ADMIN" });
    expect(update).toHaveBeenCalledWith({
      where: {
        clerkUserId_organisationId: {
          clerkUserId: "member_1",
          organisationId: "org_1",
        },
      },
      data: { role: "ADMIN" },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organisationId: "org_1",
        actorClerkUserId: "owner_1",
        actorName: "Owner User",
        actorEmail: "owner@example.com",
        actorRole: "OWNER",
        action: "ROLE_CHANGE",
        entityType: "ORGANISATION_USER",
        entityId: "membership_1",
        entityLabel: "Member User",
        beforeState: { role: "MEMBER", status: "ACTIVE" },
        afterState: { role: "ADMIN", status: "ACTIVE" },
        changedFields: ["role"],
        organisationUserId: "membership_1",
      }),
    });
  });

  it("records member removal as a delete with only the prior snapshot", async () => {
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const tx = {
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "membership_1",
          clerkUserId: "member_1",
          clerkUserName: "Member User",
          clerkUserEmail: "member@example.com",
          ...activeMembership("MEMBER"),
        }),
        count: vi.fn(),
        update: vi.fn().mockResolvedValue({
          id: "membership_1",
          status: "REMOVED",
        }),
      },
      auditEvent: { create: auditCreate },
    };
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
      },
      $transaction: vi.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    });

    await caller.organisation.removeMember({
      organisationId: "org_1",
      clerkUserId: "member_1",
    });

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DELETE",
        entityType: "ORGANISATION_USER",
        beforeState: { role: "MEMBER", status: "ACTIVE" },
        changedFields: ["role", "status"],
      }),
    });
    expect(auditCreate.mock.calls[0]?.[0].data).not.toHaveProperty(
      "afterState",
    );
  });

  it("prevents demoting the last active owner", async () => {
    const update = vi.fn();
    const tx = {
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
        count: vi.fn().mockResolvedValue(1),
        update,
      },
    };
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
      },
      $transaction: vi.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    });

    await expect(
      caller.organisation.updateMemberRole({
        organisationId: "org_1",
        clerkUserId: "owner_1",
        role: "MEMBER",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "An organisation must keep at least one active owner.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it.each<
    [string, (caller: ReturnType<typeof createCaller>) => Promise<unknown>]
  >([
    [
      "role changes",
      (caller) =>
        caller.organisation.updateMemberRole({
          organisationId: "org_1",
          clerkUserId: "removed_1",
          role: "ADMIN",
        }),
    ],
    [
      "status changes",
      (caller) =>
        caller.organisation.updateMemberStatus({
          organisationId: "org_1",
          clerkUserId: "removed_1",
          status: "ACTIVE",
        }),
    ],
    [
      "removal",
      (caller) =>
        caller.organisation.removeMember({
          organisationId: "org_1",
          clerkUserId: "removed_1",
        }),
    ],
  ])("rejects %s for removed memberships", async (_label, mutate) => {
    const update = vi.fn();
    const tx = {
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(removedMembership),
        count: vi.fn(),
        update,
      },
    };
    const transaction = vi.fn(
      async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
    );
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
      },
      $transaction: transaction,
    });

    await expect(mutate(caller)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Removed organisation members must be invited again before rejoining.",
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("retries the complete owner mutation after a serialization conflict", async () => {
    const firstUpdate = vi.fn().mockResolvedValue({ role: "MEMBER" });
    const firstTx = {
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
        count: vi.fn().mockResolvedValue(2),
        update: firstUpdate,
      },
    };
    const secondUpdate = vi.fn();
    const secondTx = {
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
        count: vi.fn().mockResolvedValue(1),
        update: secondUpdate,
      },
    };
    const transaction = vi
      .fn()
      .mockImplementationOnce(
        async (operation: (client: typeof firstTx) => Promise<unknown>) => {
          await operation(firstTx);
          throw { code: "P2034" };
        },
      )
      .mockImplementationOnce(
        async (operation: (client: typeof secondTx) => Promise<unknown>) =>
          operation(secondTx),
      );
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue(activeMembership()),
      },
      $transaction: transaction,
    });

    await expect(
      caller.organisation.updateMemberRole({
        organisationId: "org_1",
        clerkUserId: "owner_1",
        role: "MEMBER",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "An organisation must keep at least one active owner.",
    });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenNthCalledWith(1, expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(transaction).toHaveBeenNthCalledWith(2, expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(firstTx.organisationUser.findUnique).toHaveBeenCalledOnce();
    expect(firstTx.organisationUser.count).toHaveBeenCalledOnce();
    expect(firstUpdate).toHaveBeenCalledOnce();
    expect(secondTx.organisationUser.findUnique).toHaveBeenCalledOnce();
    expect(secondTx.organisationUser.count).toHaveBeenCalledOnce();
    expect(secondUpdate).not.toHaveBeenCalled();
  });

  it("rejects administrator role changes independently of action flags", async () => {
    const update = vi.fn();
    const caller = createCaller(
      {
        organisationUser: {
          findUnique: vi.fn().mockResolvedValue(activeMembership("ADMIN")),
          update,
        },
      },
      {
        clerkUserId: "admin_1",
        email: "admin@example.com",
        name: "Admin User",
      },
    );

    await expect(
      caller.organisation.updateMemberRole({
        organisationId: "org_1",
        clerkUserId: "member_1",
        role: "ADMIN",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(update).not.toHaveBeenCalled();
  });
});
