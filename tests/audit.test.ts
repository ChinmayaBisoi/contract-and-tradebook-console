import { describe, expect, it, vi } from "vitest";

import { buildAuditData, writeAuditEvent } from "@/lib/audit";

const actor = {
  clerkUserId: "owner_1",
  name: "Owner User",
  email: "owner@example.com",
};

describe("audit event writer", () => {
  it("captures actor identity and changed fields", () => {
    expect(
      buildAuditData({
        organisationId: "org_1",
        actor,
        actorRole: "OWNER",
        action: "ROLE_CHANGE",
        entityType: "ORGANISATION_USER",
        entityId: "membership_1",
        entityLabel: "Member User",
        beforeState: { role: "MEMBER", status: "ACTIVE" },
        afterState: { role: "ADMIN", status: "ACTIVE" },
        organisationUserId: "membership_1",
      }),
    ).toEqual({
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
    });
  });

  it("writes the normalized event through the transaction client", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit_1" });

    await writeAuditEvent(
      { auditEvent: { create } },
      {
        organisationId: "org_1",
        actor,
        actorRole: "OWNER",
        action: "INVITE",
        entityType: "INVITATION",
        entityId: "invite_1",
        entityLabel: "member@example.com",
        afterState: { role: "MEMBER", status: "PENDING" },
        invitationId: "invite_1",
      },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorClerkUserId: "owner_1",
        actorName: "Owner User",
        actorEmail: "owner@example.com",
        changedFields: ["role", "status"],
      }),
    });
  });

  it("keeps create, update, and delete snapshots unambiguous", () => {
    const create = buildAuditData({
      organisationId: "org_1",
      actor,
      actorRole: "OWNER",
      action: "CREATE",
      entityType: "CONTRACT",
      entityId: "contract_1",
      afterState: { status: "DRAFT" },
    });
    const update = buildAuditData({
      organisationId: "org_1",
      actor,
      actorRole: "OWNER",
      action: "UPDATE",
      entityType: "CONTRACT",
      entityId: "contract_1",
      beforeState: { status: "DRAFT" },
      afterState: { status: "FINALIZED" },
    });
    const deleted = buildAuditData({
      organisationId: "org_1",
      actor,
      actorRole: "OWNER",
      action: "DELETE",
      entityType: "ORGANISATION_USER",
      entityId: "membership_1",
      beforeState: { role: "MEMBER", status: "ACTIVE" },
    });

    expect(create).toMatchObject({
      afterState: { status: "DRAFT" },
      changedFields: ["status"],
    });
    expect(update).toMatchObject({
      beforeState: { status: "DRAFT" },
      afterState: { status: "FINALIZED" },
      changedFields: ["status"],
    });
    expect(deleted).toMatchObject({
      beforeState: { role: "MEMBER", status: "ACTIVE" },
      changedFields: ["role", "status"],
    });
    expect(deleted).not.toHaveProperty("afterState");
  });
});
