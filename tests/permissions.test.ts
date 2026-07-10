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

  it("lets managers manage membership but not organisation records", () => {
    expect(
      hasOrgPermission({ role: "MANAGER", action: "organisation:read" }),
    ).toBe(true);
    expect(
      hasOrgPermission({
        role: "MANAGER",
        action: "organisation:user:invite",
      }),
    ).toBe(true);
    expect(
      hasOrgPermission({
        role: "MANAGER",
        action: "organisation:user:remove",
      }),
    ).toBe(true);
    expect(
      hasOrgPermission({
        role: "MANAGER",
        action: "organisation:user:status:update",
      }),
    ).toBe(true);
    expect(
      hasOrgPermission({ role: "MANAGER", action: "organisation:create" }),
    ).toBe(false);
    expect(
      hasOrgPermission({ role: "MANAGER", action: "organisation:update" }),
    ).toBe(false);
    expect(
      hasOrgPermission({ role: "MANAGER", action: "organisation:delete" }),
    ).toBe(false);
  });

  it("limits members to read access", () => {
    expect(getPermissionsForOrgRole("MEMBER")).toEqual(
      new Set(["organisation:read"]),
    );
  });
});
