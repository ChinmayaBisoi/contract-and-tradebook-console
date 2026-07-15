import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
} from "@/lib/organisation-access";
import { hasOrgPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function buildOrganisationExportFileName(orgId: string) {
  return `organisation-${orgId}-export.json`;
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      orgId: string;
    }>;
  },
) {
  const session = await auth();
  if (!session.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = await context.params;
  const membership = await checkOrgPermission({
    clerkUserId: session.userId,
    organisationId: params.orgId,
    action: "organisation:read",
    findMembership: createOrganisationMembershipFinder(prisma),
  });

  const canReadUsers = hasOrgPermission({
    role: membership.role,
    action: "organisation:user:read",
  });
  const canReadInvitations = hasOrgPermission({
    role: membership.role,
    action: "organisation:invitation:read",
  });
  const canReadContracts = hasOrgPermission({
    role: membership.role,
    action: "contract:read",
  });
  const canReadLineItems = hasOrgPermission({
    role: membership.role,
    action: "line-item:read",
  });
  const canReadAudit = hasOrgPermission({
    role: membership.role,
    action: "audit:read",
  });
  const canReadImports = hasOrgPermission({
    role: membership.role,
    action: "import:read",
  });

  const [
    organisation,
    organisationUsers,
    invitations,
    uploads,
    tradebookImports,
    contracts,
    lineItems,
    auditEvents,
  ] = await Promise.all([
    prisma.organisation.findUnique({
      where: { id: params.orgId },
    }),
    canReadUsers
      ? prisma.organisationUser.findMany({
          where: { organisationId: params.orgId },
          orderBy: [{ createdAt: "asc" }],
        })
      : Promise.resolve([]),
    canReadInvitations
      ? prisma.invitation.findMany({
          where: { organisationId: params.orgId },
          orderBy: [{ createdAt: "asc" }],
        })
      : Promise.resolve([]),
    canReadImports
      ? prisma.upload.findMany({
          where: { organisationId: params.orgId },
          orderBy: [{ createdAt: "asc" }],
        })
      : Promise.resolve([]),
    canReadImports
      ? prisma.tradebookImport.findMany({
          where: { organisationId: params.orgId },
          orderBy: [{ createdAt: "asc" }],
        })
      : Promise.resolve([]),
    canReadContracts
      ? prisma.contract.findMany({
          where: { organisationId: params.orgId },
          orderBy: [{ createdAt: "asc" }],
        })
      : Promise.resolve([]),
    canReadLineItems
      ? prisma.lineItem.findMany({
          where: { organisationId: params.orgId },
          orderBy: [{ createdAt: "asc" }],
        })
      : Promise.resolve([]),
    canReadAudit
      ? prisma.auditEvent.findMany({
          where: { organisationId: params.orgId },
          orderBy: [{ occurredAt: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  if (!organisation) {
    return new Response("Not found", { status: 404 });
  }

  const body = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      organisation,
      organisationUsers,
      invitations,
      uploads,
      tradebookImports,
      contracts,
      lineItems,
      auditEvents,
    },
    null,
    2,
  );

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${buildOrganisationExportFileName(params.orgId)}"`,
      "Cache-Control": "no-store",
    },
  });
}
