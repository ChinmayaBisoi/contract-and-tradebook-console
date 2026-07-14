export const organisationActions = [
  "organisation:create",
  "organisation:read",
  "organisation:update",
  "organisation:delete",
  "organisation:user:invite",
  "organisation:user:read",
  "organisation:user:update",
  "organisation:user:remove",
  "organisation:user:status:update",
  "organisation:invitation:read",
  "organisation:invitation:update",
  "organisation:invitation:cancel",
] as const;

export type OrganisationAction = (typeof organisationActions)[number];

export type OrganisationUserRole = "OWNER" | "ADMIN" | "MEMBER";

export const orgRolePermissions: Record<
  OrganisationUserRole,
  Set<OrganisationAction>
> = {
  OWNER: new Set(organisationActions),
  ADMIN: new Set([
    "organisation:read",
    "organisation:user:invite",
    "organisation:user:read",
    "organisation:user:update",
    "organisation:user:status:update",
    "organisation:invitation:read",
    "organisation:invitation:update",
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
