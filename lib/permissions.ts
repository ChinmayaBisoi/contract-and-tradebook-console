export const organisationActions = [
  "organisation:create",
  "organisation:read",
  "organisation:update",
  "organisation:delete",
  "organisation:user:invite",
  "organisation:user:remove",
  "organisation:user:status:update",
] as const;

export type OrganisationAction = (typeof organisationActions)[number];

export type OrganisationUserRole = "OWNER" | "MANAGER" | "MEMBER";

export const orgRolePermissions: Record<
  OrganisationUserRole,
  Set<OrganisationAction>
> = {
  OWNER: new Set(organisationActions),
  MANAGER: new Set([
    "organisation:read",
    "organisation:user:invite",
    "organisation:user:remove",
    "organisation:user:status:update",
  ]),
  MEMBER: new Set(["organisation:read"]),
};

export function getPermissionsForOrgRole(role: OrganisationUserRole) {
  return new Set(orgRolePermissions[role]);
}

export function hasOrgPermission({
  role,
  action,
}: {
  role: OrganisationUserRole;
  action: OrganisationAction;
}) {
  return orgRolePermissions[role].has(action);
}
