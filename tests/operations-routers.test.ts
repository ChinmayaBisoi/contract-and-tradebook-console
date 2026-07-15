// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { appRouter } from "@/trpc/routers/_app";

const auth = {
  clerkUserId: "member_1",
  email: "member@example.com",
  name: "Member User",
};

function createCaller(db: Record<string, unknown>) {
  return appRouter.createCaller({ headers: new Headers(), auth, db });
}

const membership = { role: "MEMBER", status: "ACTIVE" } as const;

describe("organisation operations routers", () => {
  it("lists scoped contracts with database-computed aggregates", async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: "contract_1",
        clientName: "Acme Trading",
        poRefNo: "PO-100",
        poDate: new Date("2026-07-01T00:00:00.000Z"),
        status: "DRAFT",
        sourceType: "EXCEL",
        paymentTerms: "Net 30",
        deliveryTerms: "FOB",
        updatedAt: new Date("2026-07-15T00:00:00.000Z"),
        itemCount: 2,
        lineTotal: "1250.50",
      },
    ]);
    const caller = createCaller({
      organisationUser: { findUnique: vi.fn().mockResolvedValue(membership) },
      contract: { count: vi.fn().mockResolvedValue(1) },
      $queryRaw: queryRaw,
    });

    const result = await caller.contract.list({
      organisationId: "org_1",
      filters: { search: "PO-100", status: "DRAFT" },
      page: 1,
      pageSize: 10,
      sort: "lineTotal",
      sortDirection: "desc",
    });

    expect(queryRaw).toHaveBeenCalledOnce();
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: "contract_1",
          itemCount: 2,
          lineTotal: "1250.50",
        }),
      ],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
      facets: {
        statuses: ["DRAFT", "FINALIZED", "ARCHIVED"],
        sourceTypes: ["EXCEL", "JSON", "AI_EXTRACT"],
      },
    });
  });

  it("searches contract IDs in both the result and count queries", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const caller = createCaller({
      organisationUser: { findUnique: vi.fn().mockResolvedValue(membership) },
      contract: { count },
      $queryRaw: queryRaw,
    });

    await caller.contract.list({
      organisationId: "org_1",
      filters: { search: "contract_abc" },
      page: 1,
      pageSize: 10,
      sort: "updatedAt",
      sortDirection: "desc",
    });

    const query = queryRaw.mock.calls[0]?.[0] as { strings?: string[] };
    expect(query.strings?.join(" ")).toContain('contract."id" ILIKE');
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          {
            id: { contains: "contract_abc", mode: "insensitive" },
          },
        ]),
      }),
    });
  });

  it("lists organisation and contract-scoped line items", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "line_1",
          workbookItemId: "ITEM-1",
          description: "Copper cathodes",
          quantity: "10",
          quantityUnit: "MT",
          unitPrice: "100",
          pricingUnit: "MT",
          total: "1000",
          updatedAt: new Date("2026-07-15T00:00:00.000Z"),
          upload: { sourceType: "EXCEL" },
          contract: {
            id: "contract_1",
            poRefNo: "PO-100",
            clientName: "Acme Trading",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          contract: {
            id: "contract_1",
            poRefNo: "PO-100",
            clientName: "Acme Trading",
          },
          quantityUnit: "MT",
          pricingUnit: "MT",
        },
      ]);
    const caller = createCaller({
      organisationUser: { findUnique: vi.fn().mockResolvedValue(membership) },
      contract: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contract_1",
          poRefNo: "PO-100",
          clientName: "Acme Trading",
          total: { toString: () => "24" },
        }),
      },
      lineItem: { findMany, count: vi.fn().mockResolvedValue(1) },
    });

    const result = await caller.lineItem.list({
      organisationId: "org_1",
      contractId: "contract_1",
      filters: { search: "copper" },
      page: 1,
      pageSize: 20,
      sort: "total",
      sortDirection: "desc",
    });

    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organisationId: "org_1",
          contractId: "contract_1",
        }),
      }),
    );
    expect(result.contract).toMatchObject({ poRefNo: "PO-100" });
    expect(result.facets).toEqual({
      contracts: [
        {
          id: "contract_1",
          poRefNo: "PO-100",
          clientName: "Acme Trading",
        },
      ],
      quantityUnits: ["MT"],
      pricingUnits: ["MT"],
      sourceTypes: ["EXCEL", "JSON", "AI_EXTRACT"],
    });
  });

  it("lists immutable audit rows with organisation and actor filters", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "audit_1",
          actorClerkUserId: "owner_1",
          actorName: "Owner User",
          actorEmail: "owner@example.com",
          actorRole: "OWNER",
          action: "ROLE_CHANGE",
          entityType: "ORGANISATION_USER",
          entityId: "membership_1",
          entityLabel: "Member User",
          beforeState: { role: "MEMBER" },
          afterState: { role: "ADMIN" },
          changedFields: ["role"],
          metadata: null,
          occurredAt: new Date("2026-07-15T00:00:00.000Z"),
          contractId: null,
          lineItemId: null,
          uploadId: null,
          tradebookImportId: null,
          organisationUserId: "membership_1",
          invitationId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          actorClerkUserId: "owner_1",
          actorName: "Owner User",
          actorEmail: "owner@example.com",
        },
      ]);
    const caller = createCaller({
      organisationUser: { findUnique: vi.fn().mockResolvedValue(membership) },
      auditEvent: { findMany, count: vi.fn().mockResolvedValue(1) },
    });

    const result = await caller.audit.list({
      organisationId: "org_1",
      filters: { action: "ROLE_CHANGE", actorId: "owner_1" },
      page: 1,
      pageSize: 10,
      sort: "occurredAt",
      sortDirection: "desc",
    });

    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organisationId: "org_1",
          action: "ROLE_CHANGE",
          actorClerkUserId: "owner_1",
        }),
      }),
    );
    expect(result.facets.actors).toEqual([
      {
        id: "owner_1",
        name: "Owner User",
        email: "owner@example.com",
      },
    ]);
  });

  it("scopes audit history to a contract inside the organisation", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const caller = createCaller({
      organisationUser: { findUnique: vi.fn().mockResolvedValue(membership) },
      auditEvent: { findMany, count },
    });

    await caller.audit.list({
      organisationId: "org_1",
      filters: { contractId: "contract_1" },
      page: 1,
      pageSize: 10,
      sort: "occurredAt",
      sortDirection: "desc",
    });

    const expectedWhere = {
      organisationId: "org_1",
      contractId: "contract_1",
    };
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
  });
});
