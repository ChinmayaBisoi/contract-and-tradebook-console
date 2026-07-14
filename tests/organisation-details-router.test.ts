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

  it("lets owners change member roles", async () => {
    const update = vi.fn().mockResolvedValue({
      clerkUserId: "member_1",
      role: "ADMIN",
    });
    const caller = createCaller({
      organisationUser: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(activeMembership())
          .mockResolvedValueOnce(activeMembership("MEMBER")),
        update,
        count: vi.fn(),
      },
    });

    await expect(
      caller.organisation.updateMemberRole({
        organisationId: "org_1",
        clerkUserId: "member_1",
        role: "ADMIN",
      }),
    ).resolves.toEqual({ clerkUserId: "member_1", role: "ADMIN" });
    expect(update).toHaveBeenCalledWith({
      where: {
        clerkUserId_organisationId: {
          clerkUserId: "member_1",
          organisationId: "org_1",
        },
      },
      data: { role: "ADMIN" },
    });
  });

  it("prevents demoting the last active owner", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(activeMembership())
      .mockResolvedValueOnce(activeMembership());
    const update = vi.fn();
    const caller = createCaller({
      organisationUser: {
        findUnique,
        count: vi.fn().mockResolvedValue(1),
        update,
      },
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
