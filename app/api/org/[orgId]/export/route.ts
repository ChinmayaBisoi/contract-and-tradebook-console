import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
} from "@/lib/organisation-access";
import {
  buildOrganisationContractsJson,
  buildOrganisationExportFileName,
  buildOrganisationWorkbook,
} from "@/lib/organisation/export";
import { prisma } from "@/lib/prisma";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(
  request: NextRequest,
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
  const format = request.nextUrl.searchParams.get("format");
  if (format !== "excel" && format !== "json") {
    return new Response("Export format must be excel or json", { status: 400 });
  }

  await checkOrgPermission({
    clerkUserId: session.userId,
    organisationId: params.orgId,
    action: "contract:read",
    findMembership: createOrganisationMembershipFinder(prisma),
  });

  const [organisation, contracts] = await Promise.all([
    prisma.organisation.findUnique({
      where: { id: params.orgId },
    }),
    prisma.contract.findMany({
      where: { organisationId: params.orgId },
      orderBy: [{ createdAt: "asc" }],
      include: {
        lineItems: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
  ]);

  if (!organisation) {
    return new Response("Not found", { status: 404 });
  }

  if (format === "excel") {
    const workbook = await buildOrganisationWorkbook({
      organisation: {
        id: organisation.id,
        name: organisation.name,
      },
      contracts,
    });

    return new Response(workbook, {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${buildOrganisationExportFileName({ orgId: params.orgId, format })}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const body = JSON.stringify(buildOrganisationContractsJson(contracts), null, 2);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${buildOrganisationExportFileName({ orgId: params.orgId, format })}"`,
      "Cache-Control": "no-store",
    },
  });
}
