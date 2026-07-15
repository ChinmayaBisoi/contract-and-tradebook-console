import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { trpcErrorResponse } from "@/lib/http/trpc-error-response";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
} from "@/lib/organisation-access";
import type { WorkbookMappingAnalysis } from "@/lib/tradebook/mapping";
import { getWorkbookReadUrl } from "@/lib/tradebook/uploadthing";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
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
    include: { upload: true },
  });

  if (!record?.upload.storageKey) {
    return new Response("Not found", { status: 404 });
  }

  const mapping = record.mappingConfig as WorkbookMappingAnalysis | null;
  const edited = mapping?.editedWorkbook;
  const storageKey = edited?.storageKey ?? record.upload.storageKey;
  const blobUrl = edited?.blobUrl ?? record.upload.blobUrl;

  try {
    const url = await getWorkbookReadUrl({ storageKey, blobUrl });
    return Response.redirect(url, 307);
  } catch {
    return new Response("Workbook URL could not be resolved.", { status: 502 });
  }
}
