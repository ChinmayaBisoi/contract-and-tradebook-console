import { TRPCError } from "@trpc/server";

import {
  hasOrgPermission,
  type OrganisationAction,
  type OrganisationUserRole,
} from "@/lib/permissions";

export type OrganisationUserStatus = "ACTIVE" | "DISABLED" | "REMOVED";

export type OrganisationMembership = {
  role: OrganisationUserRole;
  status: OrganisationUserStatus;
};

export type FindOrganisationMembership = (input: {
  clerkUserId: string;
  organisationId: string;
}) => Promise<OrganisationMembership | null>;

export type OrganisationMembershipDb = {
  organisationUser: {
    findUnique: (args: {
      where: {
        clerkUserId_organisationId: {
          clerkUserId: string;
          organisationId: string;
        };
      };
      select: {
        role: true;
        status: true;
      };
    }) => Promise<OrganisationMembership | null>;
  };
};

export function createOrganisationMembershipFinder(
  db: OrganisationMembershipDb,
): FindOrganisationMembership {
  return ({ clerkUserId, organisationId }) =>
    db.organisationUser.findUnique({
      where: {
        clerkUserId_organisationId: {
          clerkUserId,
          organisationId,
        },
      },
      select: {
        role: true,
        status: true,
      },
    });
}

export async function checkOrgPermission({
  clerkUserId,
  organisationId,
  action,
  findMembership,
  message,
}: {
  clerkUserId: string;
  organisationId: string;
  action: OrganisationAction;
  findMembership: FindOrganisationMembership;
  message?: string;
}) {
  const membership = await findMembership({ clerkUserId, organisationId });

  if (!membership) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You are not a member of this organisation.",
    });
  }

  if (membership.status === "DISABLED") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your account is disabled for this organisation.",
    });
  }

  if (membership.status === "REMOVED") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your account is removed from this organisation.",
    });
  }

  if (!hasOrgPermission({ role: membership.role, action })) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        message ??
        `You do not have permission to ${action} for this organisation.`,
    });
  }

  return membership;
}
