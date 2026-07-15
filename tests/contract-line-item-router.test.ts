// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { appRouter } from "@/trpc/routers/_app";

const ownerAuth = {
  clerkUserId: "owner_1",
  email: "owner@example.com",
  name: "Owner User",
};

function createCaller(db: Record<string, unknown>) {
  return appRouter.createCaller({
    headers: new Headers(),
    auth: ownerAuth,
    db,
  });
}

function createDb(overrides: Partial<Record<string, unknown>>) {
  const tx = {
    contract: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    lineItem: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
    $transaction: vi.fn(
      async (callback: (arg: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    ...overrides,
  };

  return { db, tx };
}

describe("contract and line item routers", () => {
  it("imports a reviewed AI proposal as one atomic draft", async () => {
    const { db, tx } = createDb({});
    tx.contract.create.mockResolvedValue({
      id: "contract_ai",
      organisationId: "org_1",
      clientName: "Acme",
      poRefNo: "PO-AI-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "DRAFT",
      sourceType: "AI_EXTRACT",
      paymentTerms: "Net 30",
      deliveryTerms: "FOB",
      total: { toString: () => "240" },
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [
        {
          id: "line_ai",
          description: "Copper",
          quantity: { toString: () => "2" },
          quantityUnit: "MT",
          unitPrice: { toString: () => "120" },
          pricingUnit: "MT",
          total: { toString: () => "240" },
          sortOrder: 0,
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ],
      auditEvents: [],
    });

    const result = await createCaller(db).contract.importDraft({
      organisationId: "org_1",
      sourceType: "AI_EXTRACT",
      proposal: {
        contract: {
          clientName: "Acme",
          poRefNo: "PO-AI-1",
          poDate: new Date("2026-07-01T00:00:00.000Z"),
          paymentTerms: "Net 30",
          deliveryTerms: "FOB",
        },
        items: [
          {
            description: "Copper",
            quantity: 2,
            quantityUnit: "MT",
            unitPrice: 120,
            pricingUnit: "MT",
          },
        ],
      },
    });

    expect(result).toMatchObject({
      id: "contract_ai",
      sourceType: "AI_EXTRACT",
      total: "240",
    });
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(tx.contract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: "AI_EXTRACT",
        total: expect.objectContaining({}),
        fieldData: expect.objectContaining({ total: 240 }),
        lineItems: {
          create: [
            expect.objectContaining({
              description: "Copper",
              sortOrder: 0,
              total: expect.objectContaining({}),
            }),
          ],
        },
      }),
      include: expect.any(Object),
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "IMPORT",
          contractId: "contract_ai",
          afterState: expect.objectContaining({
            sourceType: "AI_EXTRACT",
            itemCount: 1,
            total: 240,
          }),
        }),
      }),
    );
  });

  it("creates draft contracts and records a create event", async () => {
    const { db, tx } = createDb({});
    tx.contract.create.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "DRAFT",
      sourceType: "JSON",
      paymentTerms: "Net 30",
      deliveryTerms: "FOB",
      total: { toString: () => "0" },
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      auditEvents: [],
    });

    const caller = createCaller(db);
    const result = await caller.contract.create({
      organisationId: "org_1",
      contract: {
        clientName: "Acme",
        poRefNo: "PO-1",
        poDate: new Date("2026-07-01T00:00:00.000Z"),
        paymentTerms: "Net 30",
        deliveryTerms: "FOB",
      },
    });

    expect(result).toMatchObject({ id: "contract_1", status: "DRAFT" });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entityType: "CONTRACT",
          afterState: expect.objectContaining({ status: "DRAFT" }),
        }),
      }),
    );
  });

  it("returns derived contract totals on contract reads", async () => {
    const { db, tx } = createDb({});
    tx.contract.findFirst.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "DRAFT",
      sourceType: "JSON",
      paymentTerms: "Net 30",
      deliveryTerms: "FOB",
      total: { toString: () => "240" },
      fieldData: { total: 240, items: [] },
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      auditEvents: [],
    });

    const caller = createCaller(db);

    await expect(
      caller.contract.get({
        organisationId: "org_1",
        id: "contract_1",
      }),
    ).resolves.toMatchObject({
      id: "contract_1",
      total: "240",
      fieldData: expect.objectContaining({ total: 240 }),
    });
  });

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

  it("finalizes draft contracts and records a status change event", async () => {
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
      total: { toString: () => "0" },
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      auditEvents: [],
    });
    tx.contract.update.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "FINALIZED",
      sourceType: "JSON",
      paymentTerms: null,
      deliveryTerms: null,
      total: { toString: () => "0" },
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      auditEvents: [],
    });

    const caller = createCaller(db);
    const result = await caller.contract.updateStatus({
      organisationId: "org_1",
      id: "contract_1",
      status: "FINALIZED",
    });

    expect(result).toMatchObject({ status: "FINALIZED" });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "STATUS_CHANGE",
          entityType: "CONTRACT",
          beforeState: { status: "DRAFT" },
          afterState: { status: "FINALIZED" },
        }),
      }),
    );
  });

  it("archives finalized contracts and records a status change event", async () => {
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
      total: { toString: () => "0" },
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      auditEvents: [],
    });
    tx.contract.update.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "ARCHIVED",
      sourceType: "JSON",
      paymentTerms: null,
      deliveryTerms: null,
      total: { toString: () => "0" },
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      auditEvents: [],
    });

    const caller = createCaller(db);
    const result = await caller.contract.updateStatus({
      organisationId: "org_1",
      id: "contract_1",
      status: "ARCHIVED",
    });

    expect(result).toMatchObject({ status: "ARCHIVED" });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "STATUS_CHANGE",
          entityType: "CONTRACT",
          beforeState: { status: "FINALIZED" },
          afterState: { status: "ARCHIVED" },
        }),
      }),
    );
  });

  it("rejects invalid contract status transitions", async () => {
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
      total: { toString: () => "0" },
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      auditEvents: [],
    });

    const caller = createCaller(db);
    await expect(
      caller.contract.updateStatus({
        organisationId: "org_1",
        id: "contract_1",
        status: "ARCHIVED",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Contract status cannot change from DRAFT to ARCHIVED.",
    });

    expect(tx.contract.update).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects reverse contract status transitions from archived", async () => {
    const { db, tx } = createDb({});
    tx.contract.findFirst.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "ARCHIVED",
      sourceType: "JSON",
      paymentTerms: null,
      deliveryTerms: null,
      total: { toString: () => "0" },
      fieldData: {},
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      lineItems: [],
      auditEvents: [],
    });

    const caller = createCaller(db);
    await expect(
      caller.contract.updateStatus({
        organisationId: "org_1",
        id: "contract_1",
        status: "FINALIZED",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Contract status cannot change from ARCHIVED to FINALIZED.",
    });

    expect(tx.contract.update).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
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
      total: { toString: () => "0" },
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

  it("creates line items for draft contracts and records a create event", async () => {
    const { db, tx } = createDb({});
    tx.contract.findFirst
      .mockResolvedValueOnce({
        id: "contract_1",
        organisationId: "org_1",
        clientName: "Acme",
        poRefNo: "PO-1",
        poDate: new Date("2026-07-01T00:00:00.000Z"),
        status: "DRAFT",
        paymentTerms: null,
        deliveryTerms: null,
        lineItems: [],
      })
      .mockResolvedValueOnce({
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
            description: "Steel bolts",
            quantity: { toString: () => "20" },
            quantityUnit: "pcs",
            unitPrice: { toString: () => "10" },
            pricingUnit: "pcs",
            total: { toString: () => "200" },
          },
        ],
      });
    tx.lineItem.create.mockResolvedValue({
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

    const caller = createCaller(db);
    const result = await caller.lineItem.create({
      organisationId: "org_1",
      contractId: "contract_1",
      lineItem: {
        description: "Steel bolts",
        quantity: 20,
        quantityUnit: "pcs",
        unitPrice: 10,
        pricingUnit: "pcs",
      },
    });

    expect(result).toMatchObject({ id: "line_1", total: "200" });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entityType: "LINE_ITEM",
          entityId: "line_1",
        }),
      }),
    );
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
    const syncCall = tx.contract.update.mock.calls.at(-1)?.[0] as {
      data: {
        total: { toString(): string };
        fieldData: { total: number };
      };
    };
    expect(syncCall.data.total.toString()).toBe("240");
    expect(syncCall.data.fieldData).toMatchObject({ total: 240 });
  });

  it("deletes draft contracts and their dependent line items", async () => {
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

    const caller = createCaller(db);

    await expect(
      caller.contract.delete({
        organisationId: "org_1",
        id: "contract_1",
      }),
    ).resolves.toEqual({ id: "contract_1" });

    expect(tx.contract.delete).toHaveBeenCalledWith({
      where: { id: "contract_1" },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETE",
          entityType: "CONTRACT",
        }),
      }),
    );
  });

  it("deletes line items only while the parent contract is draft", async () => {
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
    tx.lineItem.delete.mockResolvedValue({ id: "line_1" });
    tx.contract.findFirst.mockResolvedValue({
      id: "contract_1",
      organisationId: "org_1",
      status: "DRAFT",
      clientName: "Acme",
      poRefNo: "PO-1",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      paymentTerms: null,
      deliveryTerms: null,
      lineItems: [],
    });

    const caller = createCaller(db);

    await expect(
      caller.lineItem.delete({
        organisationId: "org_1",
        id: "line_1",
      }),
    ).resolves.toEqual({ id: "line_1", contractId: "contract_1" });

    expect(tx.lineItem.delete).toHaveBeenCalledWith({
      where: { id: "line_1" },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETE",
          entityType: "LINE_ITEM",
        }),
      }),
    );
    const syncCall = tx.contract.update.mock.calls.at(-1)?.[0] as {
      data: {
        total: { toString(): string };
        fieldData: { total: number };
      };
    };
    expect(syncCall.data.total.toString()).toBe("0");
    expect(syncCall.data.fieldData).toMatchObject({ total: 0 });
  });
});
