import { describe, expect, it } from "vitest";

import {
  getPermissionsForOrgRole,
  hasOrgPermission,
  organisationActions,
} from "@/lib/permissions";

describe("organisation permission matrix", () => {
  it("grants owners every organisation action", () => {
    for (const action of organisationActions) {
      expect(hasOrgPermission({ role: "OWNER", action })).toBe(true);
    }
  });

  it("lets admins manage member invitations without destructive access", () => {
    expect(
      hasOrgPermission({ role: "ADMIN", action: "organisation:read" }),
    ).toBe(true);
    expect(
      hasOrgPermission({
        role: "ADMIN",
        action: "organisation:user:invite",
      }),
    ).toBe(true);
    expect(
      hasOrgPermission({
        role: "ADMIN",
        action: "organisation:user:update",
      }),
    ).toBe(true);
    expect(
      hasOrgPermission({
        role: "ADMIN",
        action: "organisation:invitation:read",
      }),
    ).toBe(true);
    expect(
      hasOrgPermission({
        role: "ADMIN",
        action: "organisation:invitation:update",
      }),
    ).toBe(true);
    expect(
      hasOrgPermission({ role: "ADMIN", action: "organisation:update" }),
    ).toBe(false);
    expect(
      hasOrgPermission({
        role: "ADMIN",
        action: "organisation:user:remove",
      }),
    ).toBe(false);
    expect(
      hasOrgPermission({
        role: "ADMIN",
        action: "organisation:invitation:cancel",
      }),
    ).toBe(false);
    expect(
      hasOrgPermission({ role: "ADMIN", action: "organisation:delete" }),
    ).toBe(false);
  });

  it("limits members to read access", () => {
    expect(getPermissionsForOrgRole("MEMBER")).toEqual(
      new Set(["organisation:read"]),
    );
  });
});
