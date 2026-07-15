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

  it("lets admins manage member invitations and statuses without role access", () => {
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
    ).toBe(false);
    expect(
      hasOrgPermission({
        role: "ADMIN",
        action: "organisation:user:status:update",
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
    expect(
      hasOrgPermission({ role: "ADMIN", action: "contract:create" }),
    ).toBe(true);
    expect(
      hasOrgPermission({ role: "ADMIN", action: "contract:update" }),
    ).toBe(true);
    expect(
      hasOrgPermission({ role: "ADMIN", action: "line-item:create" }),
    ).toBe(true);
    expect(
      hasOrgPermission({ role: "ADMIN", action: "line-item:update" }),
    ).toBe(true);
  });

  it("keeps members read-only for contracts and team directory", () => {
    expect(getPermissionsForOrgRole("MEMBER")).toEqual(
      new Set([
        "organisation:read",
        "organisation:user:read",
        "contract:read",
        "line-item:read",
        "audit:read",
      ]),
    );
    expect(
      hasOrgPermission({ role: "MEMBER", action: "contract:update" }),
    ).toBe(false);
    expect(
      hasOrgPermission({ role: "MEMBER", action: "line-item:update" }),
    ).toBe(false);
  });
});
