// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { appRouter } from "@/trpc/routers/_app";

const ownerAuth = {
  clerkUserId: "owner_1",
  email: "owner@example.com",
  name: "Owner User",
};

function createCaller(db: Record<string, unknown>) {
  return appRouter.createCaller({ headers: new Headers(), auth: ownerAuth, db });
}

function createDb(overrides: Partial<Record<string, unknown>>) {
  const tx = {
    contract: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    lineItem: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: "event_1" }),
    },
    organisationUser: {
      findUnique: vi.fn().mockResolvedValue({
        role: "OWNER",
        status: "ACTIVE",
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };

  const db = {
    ...tx,
    $transaction: vi.fn(async (callback: (arg: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
    ...overrides,
  };

  return { db, tx };
}

describe("contract and line item routers", () => {
  it("rejects contract updates when contract is not draft", async () => {
    const { db, tx } = createDb({});
    tx.contract.findFirst.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "FINALIZED",
      sourceType: "JSON",
      paymentTerms: null,
      deliveryTerms: null,
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      events: [],
    });

    const caller = createCaller(db);

    await expect(
      caller.contract.update({
        organisationId: "org_1",
        id: "contract_1",
        contract: {
          clientName: "Acme Updated",
          poRefNo: "PO-1",
          poDate: new Date("2026-07-01T00:00:00.000Z"),
          paymentTerms: "Net 30",
          deliveryTerms: "FOB",
        },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Only draft contracts can be modified.",
    });
    expect(tx.contract.update).not.toHaveBeenCalled();
  });

  it("updates draft contracts and records an update event", async () => {
    const { db, tx } = createDb({});
    tx.contract.findFirst.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "DRAFT",
      sourceType: "JSON",
      paymentTerms: null,
      deliveryTerms: null,
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      events: [],
    });
    tx.contract.update.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      clientName: "Acme Updated",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "DRAFT",
      sourceType: "JSON",
      paymentTerms: "Net 30",
      deliveryTerms: "FOB",
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      events: [],
    });

    const caller = createCaller(db);

    const result = await caller.contract.update({
      organisationId: "org_1",
      id: "contract_1",
      contract: {
        clientName: "Acme Updated",
        poRefNo: "PO-1",
        poDate: new Date("2026-07-01T00:00:00.000Z"),
        paymentTerms: "Net 30",
        deliveryTerms: "FOB",
      },
    });

    expect(result).toMatchObject({
      id: "contract_1",
      clientName: "Acme Updated",
      paymentTerms: "Net 30",
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE",
          entityType: "CONTRACT",
          actorClerkUserId: "owner_1",
        }),
      }),
    );
  });

  it("rejects line item creation when parent contract is not draft", async () => {
    const { db, tx } = createDb({});
    tx.contract.findFirst.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "ARCHIVED",
      paymentTerms: null,
      deliveryTerms: null,
      lineItems: [],
    });

    const caller = createCaller(db);

    await expect(
      caller.lineItem.create({
        organisationId: "org_1",
        contractId: "contract_1",
        lineItem: {
          description: "Steel bolts",
          quantity: 20,
          quantityUnit: "pcs",
          unitPrice: 10,
          pricingUnit: "pcs",
        },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Only draft contracts can be modified.",
    });
    expect(tx.lineItem.create).not.toHaveBeenCalled();
  });

  it("updates line items for draft contracts", async () => {
    const { db, tx } = createDb({});
    tx.lineItem.findFirst.mockResolvedValue({
      id: "line_1",
      contractId: "contract_1",
      workbookItemId: null,
      description: "Steel bolts",
      quantity: { toString: () => "20" },
      quantityUnit: "pcs",
      unitPrice: { toString: () => "10" },
      pricingUnit: "pcs",
      total: { toString: () => "200" },
      sortOrder: 0,
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      upload: null,
      contract: {
        id: "contract_1",
        poRefNo: "PO-1",
        clientName: "Acme",
        sourceType: "JSON",
        organisationId: "org_1",
        status: "DRAFT",
        poDate: new Date("2026-07-01T00:00:00.000Z"),
        paymentTerms: null,
        deliveryTerms: null,
      },
    });
    tx.lineItem.update.mockResolvedValue({
      id: "line_1",
      contractId: "contract_1",
      workbookItemId: null,
      description: "Steel bolts premium",
      quantity: { toString: () => "20" },
      quantityUnit: "pcs",
      unitPrice: { toString: () => "12" },
      pricingUnit: "pcs",
      total: { toString: () => "240" },
      sortOrder: 0,
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
      upload: null,
      contract: {
        id: "contract_1",
        poRefNo: "PO-1",
        clientName: "Acme",
        sourceType: "JSON",
        organisationId: "org_1",
        status: "DRAFT",
        poDate: new Date("2026-07-01T00:00:00.000Z"),
        paymentTerms: null,
        deliveryTerms: null,
      },
    });
    tx.contract.findFirst.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      status: "DRAFT",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      paymentTerms: null,
      deliveryTerms: null,
      lineItems: [
        {
          description: "Steel bolts premium",
          quantity: { toString: () => "20" },
          quantityUnit: "pcs",
          unitPrice: { toString: () => "12" },
          pricingUnit: "pcs",
          total: { toString: () => "240" },
        },
      ],
    });

    const caller = createCaller(db);

    const result = await caller.lineItem.update({
      organisationId: "org_1",
      id: "line_1",
      lineItem: {
        description: "Steel bolts premium",
        quantity: 20,
        quantityUnit: "pcs",
        unitPrice: 12,
        pricingUnit: "pcs",
      },
    });

    expect(result).toMatchObject({
      id: "line_1",
      description: "Steel bolts premium",
      total: "240",
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE",
          entityType: "LINE_ITEM",
          actorClerkUserId: "owner_1",
        }),
      }),
    );
  });
});
