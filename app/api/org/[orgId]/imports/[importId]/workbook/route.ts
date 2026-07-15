import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
} from "@/lib/organisation-access";
import { prisma } from "@/lib/prisma";
import type { ParsedWorkbook } from "@/lib/tradebook/parser";
import {
  buildReviewedWorkbook,
  buildTradebookExportFileName,
} from "@/lib/tradebook/export";
import { getWorkbookReadUrl } from "@/lib/tradebook/uploadthing";
import type { CellPatch } from "@/lib/tradebook/validation";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
  await checkOrgPermission({
    clerkUserId: session.userId,
    organisationId: params.orgId,
    action: "import:read",
    findMembership: createOrganisationMembershipFinder(prisma),
  });

  const record = await prisma.tradebookImport.findFirst({
    where: {
      id: params.importId,
      organisationId: params.orgId,
    },
    include: {
      upload: true,
    },
  });

  if (!record) {
    return new Response("Not found", { status: 404 });
  }

  if (
    !record.upload.storageKey ||
    !record.workbookSnapshot ||
    !record.formulaSnapshot
  ) {
    return new Response("Workbook is not ready for export", { status: 412 });
  }

  const url = await getWorkbookReadUrl({
    storageKey: record.upload.storageKey,
    blobUrl: record.upload.blobUrl,
  });
  const workbookResponse = await fetch(url);
  if (!workbookResponse.ok) {
    return new Response("Workbook source could not be loaded", { status: 502 });
  }

  const sourceBuffer = Buffer.from(await workbookResponse.arrayBuffer());
  const parsed: ParsedWorkbook = {
    workbookSnapshot: record.workbookSnapshot as ParsedWorkbook["workbookSnapshot"],
    formulaSnapshot: record.formulaSnapshot as ParsedWorkbook["formulaSnapshot"],
  };
  const patches = Array.isArray(record.reviewPatches)
    ? (record.reviewPatches as CellPatch[])
    : [];
  const file = await buildReviewedWorkbook({
    sourceBuffer,
    parsed,
    patches,
  });

  return new Response(file, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${buildTradebookExportFileName(record.upload.fileName)}"`,
      "Cache-Control": "no-store",
    },
  });
}
