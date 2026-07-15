import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { buildAuditData, writeAuditEvent } from "@/lib/audit";
import { assertDraftContract } from "@/lib/contracts/assert-draft-contract";
import {
  buildContractFieldData,
  computeContractTotal,
} from "@/lib/contracts/contract-field-data";
import { lineItemInputSchema } from "@/lib/contracts/contract-schemas";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
  type OrganisationMembership,
} from "@/lib/organisation-access";
import { publishRealtimeEvent } from "@/lib/realtime/events";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const lineItemListInput = z.object({
  organisationId: z.string().min(1),
  contractId: z.string().min(1).optional(),
  filters: z
    .object({
      search: z.string().trim().max(100).optional(),
      contractId: z.string().min(1).optional(),
      quantityUnit: z.string().trim().max(50).optional(),
      pricingUnit: z.string().trim().max(50).optional(),
      sourceType: z.enum(["EXCEL", "JSON", "AI_EXTRACT"]).optional(),
      totalMin: z.coerce.number().nonnegative().optional(),
      totalMax: z.coerce.number().nonnegative().optional(),
    })
    .default({}),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]).default(10),
  sort: z
    .enum([
      "description",
      "quantity",
      "unitPrice",
      "total",
      "poRefNo",
      "updatedAt",
    ])
    .default("updatedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

const lineItemCreateInput = z.object({
  organisationId: z.string().min(1),
  contractId: z.string().min(1),
  lineItem: lineItemInputSchema,
});

const lineItemUpdateInput = z.object({
  organisationId: z.string().min(1),
  id: z.string().min(1),
  lineItem: lineItemInputSchema,
});

const lineItemDeleteInput = z.object({
  organisationId: z.string().min(1),
  id: z.string().min(1),
});

type OperationsDb = {
  organisationUser: {
    findUnique: (args: unknown) => Promise<OrganisationMembership | null>;
  };
  contract: {
    findFirst: (args: unknown) => Promise<ContractRecord | null>;
    update: (args: unknown) => Promise<ContractRecord>;
  };
  lineItem: {
    findMany: (args: unknown) => Promise<LineItemResult[]>;
    count: (args: unknown) => Promise<number>;
    findFirst: (args: unknown) => Promise<LineItemResult | null>;
    create: (args: unknown) => Promise<LineItemResult>;
    update: (args: unknown) => Promise<LineItemResult>;
    delete: (args: unknown) => Promise<unknown>;
  };
  auditEvent: {
    create: (args: {
      data: ReturnType<typeof buildAuditData>;
    }) => Promise<unknown>;
  };
  $transaction: <T>(callback: (tx: OperationsDb) => Promise<T>) => Promise<T>;
};

type ContractRecord = {
  id: string;
  organisationId: string;
  status: "DRAFT" | "FINALIZED" | "ARCHIVED";
  clientName: string;
  poRefNo: string;
  poDate: Date;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  lineItems: Array<{
    description: string;
    quantity: { toString(): string };
    quantityUnit: string | null;
    unitPrice: { toString(): string };
    pricingUnit: string | null;
    total: { toString(): string } | null;
    sortOrder: number;
  }>;
};

type LineItemResult = {
  id: string;
  contractId: string;
  workbookItemId: string | null;
  description: string;
  quantity: { toString(): string };
  quantityUnit: string | null;
  unitPrice: { toString(): string };
  pricingUnit: string | null;
  total: { toString(): string } | null;
  sortOrder: number;
  updatedAt: Date;
  upload: { sourceType: "EXCEL" | "JSON" | "AI_EXTRACT" } | null;
  contract: {
    id: string;
    poRefNo: string;
    clientName: string;
    sourceType: "EXCEL" | "JSON" | "AI_EXTRACT";
    organisationId: string;
    status: "DRAFT" | "FINALIZED" | "ARCHIVED";
    poDate: Date;
    paymentTerms: string | null;
    deliveryTerms: string | null;
    lineItems?: ContractRecord["lineItems"];
  };
};

function isPrismaError(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function mapWriteError(error: unknown) {
  if (isPrismaError(error, "P2025")) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This line item changed before the action completed.",
    });
  }

  throw error;
}

function mapLineItem(row: LineItemResult) {
  return {
    id: row.id,
    workbookItemId: row.workbookItemId,
    description: row.description,
    quantity: row.quantity.toString(),
    quantityUnit: row.quantityUnit,
    unitPrice: row.unitPrice.toString(),
    pricingUnit: row.pricingUnit,
    total: row.total?.toString() ?? null,
    sourceType: row.upload?.sourceType ?? row.contract.sourceType,
    updatedAt: row.updatedAt,
    sortOrder: row.sortOrder,
    contract: {
      id: row.contract.id,
      poRefNo: row.contract.poRefNo,
      clientName: row.contract.clientName,
      status: row.contract.status,
    },
  };
}

async function syncContractFieldData(
  tx: OperationsDb,
  contract: {
    id: string;
    clientName: string;
    poRefNo: string;
    poDate: Date;
    paymentTerms: string | null;
    deliveryTerms: string | null;
    lineItems: ContractRecord["lineItems"];
  },
) {
  const items = contract.lineItems.map((lineItem) => ({
    description: lineItem.description,
    quantity: Number(lineItem.quantity.toString()),
    quantity_unit: lineItem.quantityUnit ?? undefined,
    unit_price: Number(lineItem.unitPrice.toString()),
    pricing_unit: lineItem.pricingUnit ?? undefined,
    total: Number(lineItem.total?.toString() ?? "0"),
  }));

  await tx.contract.update({
    where: { id: contract.id },
    data: {
      total: new Prisma.Decimal(computeContractTotal(items)),
      fieldData: buildContractFieldData({
        contract: {
          clientName: contract.clientName,
          poRefNo: contract.poRefNo,
          poDate: contract.poDate,
          paymentTerms: contract.paymentTerms ?? undefined,
          deliveryTerms: contract.deliveryTerms ?? undefined,
        },
        items,
      }),
    },
  });
}

export const lineItemRouter = createTRPCRouter({
  list: protectedProcedure
    .input(lineItemListInput)
    .query(async ({ ctx, input }) => {
      const db = ctx.db as unknown as OperationsDb;
      await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "line-item:read",
        findMembership: createOrganisationMembershipFinder(db),
      });

      const contractId = input.contractId ?? input.filters.contractId;
      const contract = input.contractId
        ? await db.contract.findFirst({
            where: {
              id: input.contractId,
              organisationId: input.organisationId,
            },
            select: {
              id: true,
              poRefNo: true,
              clientName: true,
              status: true,
              organisationId: true,
              poDate: true,
              paymentTerms: true,
              deliveryTerms: true,
              lineItems: false,
            },
          })
        : null;
      if (input.contractId && !contract) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contract was not found in this organisation.",
        });
      }

      const where: Record<string, unknown> = {
        organisationId: input.organisationId,
        ...(contractId ? { contractId } : {}),
      };
      if (input.filters.search) {
        where.OR = [
          {
            description: {
              contains: input.filters.search,
              mode: "insensitive",
            },
          },
          {
            workbookItemId: {
              contains: input.filters.search,
              mode: "insensitive",
            },
          },
          {
            contract: {
              poRefNo: { contains: input.filters.search, mode: "insensitive" },
            },
          },
          {
            contract: {
              clientName: {
                contains: input.filters.search,
                mode: "insensitive",
              },
            },
          },
        ];
      }
      if (input.filters.quantityUnit)
        where.quantityUnit = input.filters.quantityUnit;
      if (input.filters.pricingUnit) where.pricingUnit = input.filters.pricingUnit;
      if (input.filters.sourceType)
        where.contract = {
          sourceType: input.filters.sourceType,
        };
      if (
        input.filters.totalMin !== undefined ||
        input.filters.totalMax !== undefined
      ) {
        where.total = {
          ...(input.filters.totalMin !== undefined
            ? { gte: input.filters.totalMin }
            : {}),
          ...(input.filters.totalMax !== undefined
            ? { lte: input.filters.totalMax }
            : {}),
        };
      }

      const orderBy =
        input.sort === "poRefNo"
          ? { contract: { poRefNo: input.sortDirection } }
          : { [input.sort]: input.sortDirection };
      const [rows, total, facetRows] = await Promise.all([
        db.lineItem.findMany({
          where,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          orderBy,
          include: {
            upload: { select: { sourceType: true } },
            contract: {
              select: {
                id: true,
                poRefNo: true,
                clientName: true,
                sourceType: true,
                organisationId: true,
                status: true,
                poDate: true,
                paymentTerms: true,
                deliveryTerms: true,
              },
            },
          },
        }),
        db.lineItem.count({ where }),
        db.lineItem.findMany({
          where: { organisationId: input.organisationId },
          distinct: ["contractId", "quantityUnit", "pricingUnit"],
          select: {
            quantityUnit: true,
            pricingUnit: true,
            contract: { select: { id: true, poRefNo: true, clientName: true } },
          },
        }),
      ]);

      const contracts = new Map<
        string,
        { id: string; poRefNo: string; clientName: string }
      >();
      const quantityUnits = new Set<string>();
      const pricingUnits = new Set<string>();
      for (const row of facetRows) {
        if (row.contract) contracts.set(row.contract.id, row.contract);
        if (row.quantityUnit) quantityUnits.add(row.quantityUnit);
        if (row.pricingUnit) pricingUnits.add(row.pricingUnit);
      }

      return {
        data: rows.map(mapLineItem),
        contract,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total,
          pageCount: Math.ceil(total / input.pageSize),
        },
        facets: {
          contracts: [...contracts.values()],
          quantityUnits: [...quantityUnits].sort(),
          pricingUnits: [...pricingUnits].sort(),
          sourceTypes: ["EXCEL", "JSON", "AI_EXTRACT"] as const,
        },
      };
    }),

  create: protectedProcedure
    .input(lineItemCreateInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as OperationsDb;
      const membership = await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "line-item:create",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        const lineItem = await db.$transaction(async (tx) => {
          const contract = await tx.contract.findFirst({
            where: {
              id: input.contractId,
              organisationId: input.organisationId,
            },
            include: { lineItems: { orderBy: [{ sortOrder: "asc" }] } },
          });

          if (!contract) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Contract was not found in this organisation.",
            });
          }

          assertDraftContract(contract);

          const latestSortOrder =
            contract.lineItems[contract.lineItems.length - 1]?.sortOrder ?? -1;

          const lineItem = await tx.lineItem.create({
            data: {
              organisationId: input.organisationId,
              contractId: contract.id,
              description: input.lineItem.description,
              quantity: new Prisma.Decimal(input.lineItem.quantity),
              quantityUnit: input.lineItem.quantityUnit,
              unitPrice: new Prisma.Decimal(input.lineItem.unitPrice),
              pricingUnit: input.lineItem.pricingUnit,
              total: new Prisma.Decimal(
                input.lineItem.quantity * input.lineItem.unitPrice,
              ),
              sortOrder: latestSortOrder + 1,
            },
            include: {
              upload: { select: { sourceType: true } },
              contract: {
                select: {
                  id: true,
                  poRefNo: true,
                  clientName: true,
                  sourceType: true,
                  organisationId: true,
                  status: true,
                  poDate: true,
                  paymentTerms: true,
                  deliveryTerms: true,
                },
              },
            },
          });

          const contractAfterCreate = await tx.contract.findFirst({
            where: { id: contract.id, organisationId: input.organisationId },
            include: { lineItems: { orderBy: [{ sortOrder: "asc" }] } },
          });

          if (!contractAfterCreate) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Contract was not found in this organisation.",
            });
          }

          await syncContractFieldData(tx, contractAfterCreate);

          await writeAuditEvent(tx, {
            organisationId: input.organisationId,
            actor: ctx.auth,
            actorRole: membership.role,
            action: "CREATE",
            entityType: "LINE_ITEM",
            entityId: lineItem.id,
            entityLabel: lineItem.description,
            contractId: contract.id,
            lineItemId: lineItem.id,
            afterState: {
              description: lineItem.description,
              quantity: lineItem.quantity.toString(),
              quantityUnit: lineItem.quantityUnit,
              unitPrice: lineItem.unitPrice.toString(),
              pricingUnit: lineItem.pricingUnit,
              total: lineItem.total?.toString() ?? null,
            },
          });

          return mapLineItem(lineItem);
        });

        publishRealtimeEvent({
          entity: "lineItem",
          action: "created",
          entityId: lineItem.id,
          organisationId: input.organisationId,
          contractId: lineItem.contract.id,
        });

        return lineItem;
      } catch (error) {
        return mapWriteError(error);
      }
    }),

  update: protectedProcedure
    .input(lineItemUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as OperationsDb;
      const membership = await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "line-item:update",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        const updated = await db.$transaction(async (tx) => {
          const existing = await tx.lineItem.findFirst({
            where: {
              id: input.id,
              organisationId: input.organisationId,
            },
            include: {
              upload: { select: { sourceType: true } },
              contract: {
                select: {
                  id: true,
                  poRefNo: true,
                  clientName: true,
                  sourceType: true,
                  organisationId: true,
                  status: true,
                  poDate: true,
                  paymentTerms: true,
                  deliveryTerms: true,
                },
              },
            },
          });

          if (!existing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Line item was not found in this organisation.",
            });
          }

          assertDraftContract(existing.contract);

          const updated = await tx.lineItem.update({
            where: { id: existing.id },
            data: {
              description: input.lineItem.description,
              quantity: new Prisma.Decimal(input.lineItem.quantity),
              quantityUnit: input.lineItem.quantityUnit,
              unitPrice: new Prisma.Decimal(input.lineItem.unitPrice),
              pricingUnit: input.lineItem.pricingUnit,
              total: new Prisma.Decimal(
                input.lineItem.quantity * input.lineItem.unitPrice,
              ),
            },
            include: {
              upload: { select: { sourceType: true } },
              contract: {
                select: {
                  id: true,
                  poRefNo: true,
                  clientName: true,
                  sourceType: true,
                  organisationId: true,
                  status: true,
                  poDate: true,
                  paymentTerms: true,
                  deliveryTerms: true,
                },
              },
            },
          });

          const contractAfterUpdate = await tx.contract.findFirst({
            where: {
              id: existing.contract.id,
              organisationId: input.organisationId,
            },
            include: { lineItems: { orderBy: [{ sortOrder: "asc" }] } },
          });

          if (!contractAfterUpdate) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Contract was not found in this organisation.",
            });
          }

          await syncContractFieldData(tx, contractAfterUpdate);

          await writeAuditEvent(tx, {
            organisationId: input.organisationId,
            actor: ctx.auth,
            actorRole: membership.role,
            action: "UPDATE",
            entityType: "LINE_ITEM",
            entityId: updated.id,
            entityLabel: updated.description,
            contractId: existing.contract.id,
            lineItemId: updated.id,
            beforeState: {
              description: existing.description,
              quantity: existing.quantity.toString(),
              quantityUnit: existing.quantityUnit,
              unitPrice: existing.unitPrice.toString(),
              pricingUnit: existing.pricingUnit,
              total: existing.total?.toString() ?? null,
            },
            afterState: {
              description: updated.description,
              quantity: updated.quantity.toString(),
              quantityUnit: updated.quantityUnit,
              unitPrice: updated.unitPrice.toString(),
              pricingUnit: updated.pricingUnit,
              total: updated.total?.toString() ?? null,
            },
          });

          return mapLineItem(updated);
        });

        publishRealtimeEvent({
          entity: "lineItem",
          action: "updated",
          entityId: updated.id,
          organisationId: input.organisationId,
          contractId: updated.contract.id,
        });

        return updated;
      } catch (error) {
        return mapWriteError(error);
      }
    }),

  delete: protectedProcedure
    .input(lineItemDeleteInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as OperationsDb;
      const membership = await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "line-item:update",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        const deleted = await db.$transaction(async (tx) => {
          const existing = await tx.lineItem.findFirst({
            where: {
              id: input.id,
              organisationId: input.organisationId,
            },
            include: {
              upload: { select: { sourceType: true } },
              contract: {
                select: {
                  id: true,
                  poRefNo: true,
                  clientName: true,
                  sourceType: true,
                  organisationId: true,
                  status: true,
                  poDate: true,
                  paymentTerms: true,
                  deliveryTerms: true,
                },
              },
            },
          });

          if (!existing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Line item was not found in this organisation.",
            });
          }

          assertDraftContract(existing.contract);

          await writeAuditEvent(tx, {
            organisationId: input.organisationId,
            actor: ctx.auth,
            actorRole: membership.role,
            action: "DELETE",
            entityType: "LINE_ITEM",
            entityId: existing.id,
            entityLabel: existing.description,
            contractId: existing.contract.id,
            lineItemId: existing.id,
            beforeState: {
              description: existing.description,
              quantity: existing.quantity.toString(),
              quantityUnit: existing.quantityUnit,
              unitPrice: existing.unitPrice.toString(),
              pricingUnit: existing.pricingUnit,
              total: existing.total?.toString() ?? null,
            },
          });

          await tx.lineItem.delete({
            where: { id: existing.id },
          });

          const contractAfterDelete = await tx.contract.findFirst({
            where: {
              id: existing.contract.id,
              organisationId: input.organisationId,
            },
            include: { lineItems: { orderBy: [{ sortOrder: "asc" }] } },
          });

          if (!contractAfterDelete) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Contract was not found in this organisation.",
            });
          }

          await syncContractFieldData(tx, contractAfterDelete);

          return { id: existing.id, contractId: existing.contract.id };
        });

        publishRealtimeEvent({
          entity: "lineItem",
          action: "deleted",
          entityId: deleted.id,
          organisationId: input.organisationId,
          contractId: deleted.contractId,
        });

        return deleted;
      } catch (error) {
        return mapWriteError(error);
      }
    }),
});
