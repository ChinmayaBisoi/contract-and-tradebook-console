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

describe("invitation router", () => {
  it("does not expose direct organisation membership creation", async () => {
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "OWNER",
          status: "ACTIVE",
        }),
        create: vi.fn().mockResolvedValue({ id: "membership_1" }),
      },
    });

    await expect(
      caller.organisation.inviteMember({
        organisationId: "org_1",
        clerkUserId: "member_1",
        clerkUserEmail: "member@example.com",
        role: "MEMBER",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists combined received and managed invitations with allowed actions", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "invite_1",
        email: "owner@example.com",
        organisationId: "org_1",
        organisation: {
          id: "org_1",
          name: "Contract Ops",
          users: [{ role: "OWNER", status: "ACTIVE" }],
        },
        role: "ADMIN",
        inviterClerkUserId: "owner_2",
        inviterName: "Second Owner",
        inviterEmail: "owner2@example.com",
        status: "PENDING",
        expiresAt: new Date("2099-07-21T12:00:00.000Z"),
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const caller = createCaller({
      invitation: { findMany, count: vi.fn().mockResolvedValue(1) },
    });

    const result = await caller.invitation.list({
      filters: { direction: "all" },
      page: 1,
      pageSize: 10,
      sort: "createdAt",
      sortDirection: "desc",
    });

    expect(result.data[0]).toMatchObject({
      id: "invite_1",
      direction: "both",
      status: "PENDING",
      organisationName: "Contract Ops",
      canAccept: true,
      canDecline: true,
      canEdit: true,
      canCancel: true,
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      pageCount: 1,
    });
  });

  it("normalizes invitation emails and lets owners invite administrators", async () => {
    const create = vi.fn().mockResolvedValue({ id: "invite_1" });
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "OWNER",
          status: "ACTIVE",
        }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      invitation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
      },
    });

    await expect(
      caller.invitation.create({
        organisationId: "org_1",
        email: "  ADMIN@Example.COM ",
        role: "ADMIN",
        expiresAt: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ id: "invite_1" });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "admin@example.com",
        inviterClerkUserId: "owner_1",
        inviterName: "Owner User",
        inviterEmail: "owner@example.com",
        role: "ADMIN",
        status: "PENDING",
      }),
    });
  });

  it("limits administrators to member invitations", async () => {
    const caller = createCaller(
      {
        organisationUser: {
          findUnique: vi.fn().mockResolvedValue({
            role: "ADMIN",
            status: "ACTIVE",
          }),
        },
      },
      {
        clerkUserId: "admin_1",
        email: "admin@example.com",
        name: "Admin User",
      },
    );

    await expect(
      caller.invitation.create({
        organisationId: "org_1",
        email: "new-admin@example.com",
        role: "ADMIN",
        expiresAt: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects duplicate pending invitations", async () => {
    const caller = createCaller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "OWNER",
          status: "ACTIVE",
        }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      invitation: {
        findFirst: vi.fn().mockResolvedValue({ id: "invite_existing" }),
      },
    });

    await expect(
      caller.invitation.create({
        organisationId: "org_1",
        email: "member@example.com",
        role: "MEMBER",
        expiresAt: new Date("2099-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "A pending invitation already exists for this email.",
    });
  });

  it("edits a pending invitation when the requester has permission", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "invite_1",
      role: "MEMBER",
      status: "PENDING",
    });
    const caller = createCaller({
      invitation: {
        findUnique: vi.fn().mockResolvedValue({
          id: "invite_1",
          email: "member@example.com",
          organisationId: "org_1",
          role: "MEMBER",
          status: "PENDING",
          expiresAt: new Date("2099-07-21T12:00:00.000Z"),
        }),
        update,
      },
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "OWNER",
          status: "ACTIVE",
        }),
      },
    });

    await expect(
      caller.invitation.update({
        id: "invite_1",
        role: "MEMBER",
        expiresAt: new Date("2099-07-28T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ id: "invite_1", role: "MEMBER" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "invite_1", status: "PENDING" },
      data: {
        role: "MEMBER",
        expiresAt: new Date("2099-07-28T12:00:00.000Z"),
      },
    });
  });

  it("accepts an invitation and reactivates membership in one transaction", async () => {
    const invitation = {
      id: "invite_1",
      email: "member@example.com",
      organisationId: "org_1",
      role: "MEMBER",
      status: "PENDING",
      expiresAt: new Date("2099-07-21T12:00:00.000Z"),
    };
    const upsert = vi.fn().mockResolvedValue({ id: "membership_1" });
    const update = vi
      .fn()
      .mockResolvedValue({ ...invitation, status: "ACCEPTED" });
    const db = {
      invitation: {
        findUnique: vi.fn().mockResolvedValue(invitation),
        update,
      },
      organisationUser: { upsert },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(db),
      ),
    };
    const caller = createCaller(db, {
      clerkUserId: "member_1",
      email: "member@example.com",
      name: "Member User",
    });

    await expect(
      caller.invitation.accept({ id: "invite_1" }),
    ).resolves.toMatchObject({ status: "ACCEPTED" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clerkUserId_organisationId: {
            clerkUserId: "member_1",
            organisationId: "org_1",
          },
        },
        update: expect.objectContaining({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      }),
    );
    expect(db.$transaction).toHaveBeenCalledOnce();
  });

  it("rejects acceptance when the signed-in email does not match", async () => {
    const caller = createCaller(
      {
        invitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "invite_1",
            email: "other@example.com",
            organisationId: "org_1",
            role: "MEMBER",
            status: "PENDING",
            expiresAt: new Date("2099-07-21T12:00:00.000Z"),
          }),
        },
      },
      {
        clerkUserId: "member_1",
        email: "member@example.com",
        name: "Member User",
      },
    );

    await expect(
      caller.invitation.accept({ id: "invite_1" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This invitation belongs to a different email address.",
    });
  });

  it("persists expiry before rejecting an expired invitation", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "invite_1",
      status: "EXPIRED",
    });
    const caller = createCaller(
      {
        invitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "invite_1",
            email: "member@example.com",
            organisationId: "org_1",
            role: "MEMBER",
            status: "PENDING",
            expiresAt: new Date("2020-01-01T00:00:00.000Z"),
          }),
          update,
        },
      },
      {
        clerkUserId: "member_1",
        email: "member@example.com",
        name: "Member User",
      },
    );

    await expect(
      caller.invitation.accept({ id: "invite_1" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This invitation has expired.",
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "invite_1", status: "PENDING" },
      data: { status: "EXPIRED" },
    });
  });

  it("lets the recipient decline a pending invitation", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "invite_1",
      status: "DECLINED",
    });
    const caller = createCaller(
      {
        invitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "invite_1",
            email: "member@example.com",
            organisationId: "org_1",
            role: "MEMBER",
            status: "PENDING",
            expiresAt: new Date("2099-07-21T12:00:00.000Z"),
          }),
          update,
        },
      },
      {
        clerkUserId: "member_1",
        email: "member@example.com",
        name: "Member User",
      },
    );

    await expect(
      caller.invitation.decline({ id: "invite_1" }),
    ).resolves.toMatchObject({ status: "DECLINED" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "invite_1", status: "PENDING" },
      data: { status: "DECLINED" },
    });
  });

  it("allows only owners to cancel pending invitations", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "invite_1",
      status: "CANCELLED",
    });
    const caller = createCaller({
      invitation: {
        findUnique: vi.fn().mockResolvedValue({
          id: "invite_1",
          email: "member@example.com",
          organisationId: "org_1",
          role: "MEMBER",
          status: "PENDING",
          expiresAt: new Date("2099-07-21T12:00:00.000Z"),
        }),
        update,
      },
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "OWNER",
          status: "ACTIVE",
        }),
      },
    });

    await expect(
      caller.invitation.cancel({ id: "invite_1" }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "invite_1", status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  });
});
