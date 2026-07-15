import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { trpcErrorResponse } from "@/lib/http/trpc-error-response";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
} from "@/lib/organisation-access";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      orgId: string;
      importId: string;
    }>;
  },
) {
  const session = await auth();
  if (!session.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = await context.params;
  try {
    await checkOrgPermission({
      clerkUserId: session.userId,
      organisationId: params.orgId,
      action: "import:read",
      findMembership: createOrganisationMembershipFinder(prisma),
    });
  } catch (error) {
    const response = trpcErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const record = await prisma.tradebookImport.findFirst({
    where: {
      id: params.importId,
      organisationId: params.orgId,
    },
    select: { id: true },
  });

  if (!record) {
    return new Response("Not found", { status: 404 });
  }

  return Response.redirect(
    new URL(`/api/org/${params.orgId}/export?format=excel`, request.url),
    307,
  );
}
