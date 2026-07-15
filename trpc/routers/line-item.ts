import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { buildContractFieldData } from "@/lib/contracts/contract-field-data";
import { lineItemInputSchema } from "@/lib/contracts/contract-schemas";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
} from "@/lib/organisation-access";
import { assertDraftContract } from "@/lib/contracts/assert-draft-contract";
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

type OperationsDb = {
  organisationUser: { findUnique: (args: unknown) => Promise<unknown> };
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
  };
  contractEvent: {
    create: (args: unknown) => Promise<unknown>;
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
  await tx.contract.update({
    where: { id: contract.id },
    data: {
      fieldData: buildContractFieldData({
        contract: {
          clientName: contract.clientName,
          poRefNo: contract.poRefNo,
          poDate: contract.poDate,
          paymentTerms: contract.paymentTerms ?? undefined,
          deliveryTerms: contract.deliveryTerms ?? undefined,
        },
        items: contract.lineItems.map((lineItem) => ({
          description: lineItem.description,
          quantity: Number(lineItem.quantity.toString()),
          quantity_unit: lineItem.quantityUnit ?? undefined,
          unit_price: Number(lineItem.unitPrice.toString()),
          pricing_unit: lineItem.pricingUnit ?? undefined,
          total: Number(lineItem.total?.toString() ?? "0"),
        })),
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
        contract: {
          organisationId: input.organisationId,
          ...(contractId ? { id: contractId } : {}),
        },
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
          organisationId: input.organisationId,
          ...(contractId ? { id: contractId } : {}),
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
          where: { contract: { organisationId: input.organisationId } },
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
      await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "line-item:create",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        return await db.$transaction(async (tx) => {
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

          await tx.contractEvent.create({
            data: {
              contractId: contract.id,
              organisationId: input.organisationId,
              actorClerkUserId: ctx.auth.clerkUserId,
              eventType: "UPDATE",
              payload: { action: "LINE_ITEM_CREATE", lineItemId: lineItem.id },
            },
          });

          return mapLineItem(lineItem);
        });
      } catch (error) {
        return mapWriteError(error);
      }
    }),

  update: protectedProcedure
    .input(lineItemUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as OperationsDb;
      await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "line-item:update",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        return await db.$transaction(async (tx) => {
          const existing = await tx.lineItem.findFirst({
            where: {
              id: input.id,
              contract: { organisationId: input.organisationId },
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

          await tx.contractEvent.create({
            data: {
              contractId: existing.contract.id,
              organisationId: input.organisationId,
              actorClerkUserId: ctx.auth.clerkUserId,
              eventType: "UPDATE",
              payload: { action: "LINE_ITEM_UPDATE", lineItemId: updated.id },
            },
          });

          return mapLineItem(updated);
        });
      } catch (error) {
        return mapWriteError(error);
      }
    }),
});
