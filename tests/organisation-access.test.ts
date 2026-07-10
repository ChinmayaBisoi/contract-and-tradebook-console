import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

import { checkOrgPermission } from "@/lib/organisation-access";
import type { OrganisationAction } from "@/lib/permissions";

const ownerActions: OrganisationAction[] = [
  "organisation:create",
  "organisation:read",
  "organisation:update",
  "organisation:delete",
  "organisation:user:invite",
  "organisation:user:remove",
  "organisation:user:status:update",
];

describe("checkOrgPermission", () => {
  it("allows an active owner to perform every organisation action", async () => {
    const findMembership = vi.fn(async () => ({
      role: "OWNER" as const,
      status: "ACTIVE" as const,
    }));

    for (const action of ownerActions) {
      await expect(
        checkOrgPermission({
          clerkUserId: "user_owner",
          organisationId: "org_1",
          action,
          findMembership,
        }),
      ).resolves.toEqual({ role: "OWNER", status: "ACTIVE" });
    }
  });

  it("rejects disabled members before checking the role permission", async () => {
    const findMembership = vi.fn(async () => ({
      role: "OWNER" as const,
      status: "DISABLED" as const,
    }));

    await expect(
      checkOrgPermission({
        clerkUserId: "user_disabled",
        organisationId: "org_1",
        action: "organisation:read",
        findMembership,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Your account is disabled for this organisation.",
    });
  });

  it("rejects users who are not members of the organisation", async () => {
    const findMembership = vi.fn(async () => null);

    await expect(
      checkOrgPermission({
        clerkUserId: "user_missing",
        organisationId: "org_1",
        action: "organisation:read",
        findMembership,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("allows managers to manage members but not organisation records", async () => {
    const findMembership = vi.fn(async () => ({
      role: "MANAGER" as const,
      status: "ACTIVE" as const,
    }));

    await expect(
      checkOrgPermission({
        clerkUserId: "user_manager",
        organisationId: "org_1",
        action: "organisation:user:invite",
        findMembership,
      }),
    ).resolves.toEqual({ role: "MANAGER", status: "ACTIVE" });

    await expect(
      checkOrgPermission({
        clerkUserId: "user_manager",
        organisationId: "org_1",
        action: "organisation:update",
        findMembership,
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message:
        "You do not have permission to organisation:update for this organisation.",
    });
  });

  it("limits members to read access", async () => {
    const findMembership = vi.fn(async () => ({
      role: "MEMBER" as const,
      status: "ACTIVE" as const,
    }));

    await expect(
      checkOrgPermission({
        clerkUserId: "user_member",
        organisationId: "org_1",
        action: "organisation:read",
        findMembership,
      }),
    ).resolves.toEqual({ role: "MEMBER", status: "ACTIVE" });

    await expect(
      checkOrgPermission({
        clerkUserId: "user_member",
        organisationId: "org_1",
        action: "organisation:user:invite",
        findMembership,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
