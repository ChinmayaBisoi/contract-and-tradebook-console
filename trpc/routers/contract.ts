import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { buildContractFieldData } from "@/lib/contracts/contract-field-data";
import { contractInputSchema } from "@/lib/contracts/contract-schemas";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
} from "@/lib/organisation-access";
import { assertDraftContract } from "@/lib/contracts/assert-draft-contract";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const contractListInput = z.object({
  organisationId: z.string().min(1),
  filters: z
    .object({
      search: z.string().trim().max(100).optional(),
      status: z.enum(["DRAFT", "FINALIZED", "ARCHIVED"]).optional(),
      sourceType: z.enum(["EXCEL", "JSON", "AI_EXTRACT"]).optional(),
      poDateFrom: z.coerce.date().optional(),
      poDateTo: z.coerce.date().optional(),
    })
    .default({}),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]).default(10),
  sort: z
    .enum([
      "clientName",
      "poRefNo",
      "poDate",
      "status",
      "itemCount",
      "lineTotal",
      "updatedAt",
    ])
    .default("updatedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

const contractGetInput = z.object({
  organisationId: z.string().min(1),
  id: z.string().min(1),
});

const contractCreateInput = z.object({
  organisationId: z.string().min(1),
  contract: contractInputSchema,
});

const contractUpdateInput = z.object({
  organisationId: z.string().min(1),
  id: z.string().min(1),
  contract: contractInputSchema,
});

type ContractListRow = {
  id: string;
  clientName: string;
  poRefNo: string;
  poDate: Date;
  status: "DRAFT" | "FINALIZED" | "ARCHIVED";
  sourceType: "EXCEL" | "JSON" | "AI_EXTRACT";
  paymentTerms: string | null;
  deliveryTerms: string | null;
  updatedAt: Date;
  itemCount: number | bigint;
  lineTotal: string | { toString(): string };
};

type ContractDb = {
  organisationUser: {
    findUnique: (args: unknown) => Promise<{
      role: "OWNER" | "ADMIN" | "MEMBER";
      status: "ACTIVE" | "DISABLED" | "REMOVED";
    } | null>;
  };
  contract: {
    count: (args: unknown) => Promise<number>;
    findFirst: (args: unknown) => Promise<ContractWithRelations | null>;
    create: (args: unknown) => Promise<ContractWithRelations>;
    update: (args: unknown) => Promise<ContractWithRelations>;
  };
  contractEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
  $queryRaw: (query: unknown) => Promise<ContractListRow[]>;
  $transaction: <T>(callback: (tx: ContractDb) => Promise<T>) => Promise<T>;
};

type ContractWithRelations = {
  id: string;
  organisationId: string;
  clientName: string;
  poRefNo: string;
  poDate: Date;
  status: "DRAFT" | "FINALIZED" | "ARCHIVED";
  sourceType: "EXCEL" | "JSON" | "AI_EXTRACT";
  paymentTerms: string | null;
  deliveryTerms: string | null;
  fieldData: unknown;
  updatedAt: Date;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: { toString(): string };
    quantityUnit: string | null;
    unitPrice: { toString(): string };
    pricingUnit: string | null;
    total: { toString(): string } | null;
    sortOrder: number;
    updatedAt: Date;
  }>;
  events: Array<{
    id: string;
    eventType: "CREATE" | "UPDATE" | "STATUS_CHANGE" | "DELETE" | "IMPORT";
    actorClerkUserId: string | null;
    payload: unknown;
    createdAt: Date;
  }>;
};

const sortColumns = {
  clientName: Prisma.sql`contract."clientName"`,
  poRefNo: Prisma.sql`contract."poRefNo"`,
  poDate: Prisma.sql`contract."poDate"`,
  status: Prisma.sql`contract."status"`,
  itemCount: Prisma.sql`"itemCount"`,
  lineTotal: Prisma.sql`"lineTotal"`,
  updatedAt: Prisma.sql`contract."updatedAt"`,
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
  if (isPrismaError(error, "P2002")) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "A contract with this PO reference already exists in this organisation.",
    });
  }

  if (isPrismaError(error, "P2025")) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This contract changed before the action completed.",
    });
  }

  throw error;
}

function readItemsFromFieldData(fieldData: unknown) {
  if (
    typeof fieldData === "object" &&
    fieldData !== null &&
    "items" in fieldData &&
    Array.isArray(fieldData.items)
  ) {
    return fieldData.items;
  }

  return [];
}

export const contractRouter = createTRPCRouter({
  list: protectedProcedure
    .input(contractListInput)
    .query(async ({ ctx, input }) => {
      const db = ctx.db as unknown as ContractDb;
      await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "contract:read",
        findMembership: createOrganisationMembershipFinder(db),
      });

      const conditions = [
        Prisma.sql`contract."organisationId" = ${input.organisationId}`,
      ];
      const countWhere: Record<string, unknown> = {
        organisationId: input.organisationId,
      };

      if (input.filters.search) {
        conditions.push(
          Prisma.sql`(contract."clientName" ILIKE ${`%${input.filters.search}%`} OR contract."poRefNo" ILIKE ${`%${input.filters.search}%`})`,
        );
        countWhere.OR = [
          {
            clientName: {
              contains: input.filters.search,
              mode: "insensitive",
            },
          },
          {
            poRefNo: { contains: input.filters.search, mode: "insensitive" },
          },
        ];
      }
      if (input.filters.status) {
        conditions.push(
          Prisma.sql`contract."status" = ${input.filters.status}::"ContractStatus"`,
        );
        countWhere.status = input.filters.status;
      }
      if (input.filters.sourceType) {
        conditions.push(
          Prisma.sql`contract."sourceType" = ${input.filters.sourceType}::"UploadSourceType"`,
        );
        countWhere.sourceType = input.filters.sourceType;
      }
      if (input.filters.poDateFrom || input.filters.poDateTo) {
        const poDate: { gte?: Date; lte?: Date } = {};
        if (input.filters.poDateFrom) {
          conditions.push(
            Prisma.sql`contract."poDate" >= ${input.filters.poDateFrom}`,
          );
          poDate.gte = input.filters.poDateFrom;
        }
        if (input.filters.poDateTo) {
          conditions.push(
            Prisma.sql`contract."poDate" <= ${input.filters.poDateTo}`,
          );
          poDate.lte = input.filters.poDateTo;
        }
        countWhere.poDate = poDate;
      }

      const direction =
        input.sortDirection === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      const offset = (input.page - 1) * input.pageSize;
      const [rows, total] = await Promise.all([
        db.$queryRaw(
          Prisma.sql`
            SELECT
              contract."id",
              contract."clientName",
              contract."poRefNo",
              contract."poDate",
              contract."status",
              contract."sourceType",
              contract."paymentTerms",
              contract."deliveryTerms",
              contract."updatedAt",
              COUNT(line_item."id")::integer AS "itemCount",
              COALESCE(SUM(line_item."total"), 0)::text AS "lineTotal"
            FROM "Contract" AS contract
            LEFT JOIN "LineItem" AS line_item ON line_item."contractId" = contract."id"
            WHERE ${Prisma.join(conditions, " AND ")}
            GROUP BY contract."id"
            ORDER BY ${sortColumns[input.sort]} ${direction}, contract."id" ASC
            LIMIT ${input.pageSize} OFFSET ${offset}
          `,
        ),
        db.contract.count({ where: countWhere }),
      ]);

      return {
        data: rows.map((row) => ({
          ...row,
          itemCount: Number(row.itemCount),
          lineTotal: row.lineTotal.toString(),
        })),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total,
          pageCount: Math.ceil(total / input.pageSize),
        },
        facets: {
          statuses: ["DRAFT", "FINALIZED", "ARCHIVED"] as const,
          sourceTypes: ["EXCEL", "JSON", "AI_EXTRACT"] as const,
        },
      };
    }),

  get: protectedProcedure.input(contractGetInput).query(async ({ ctx, input }) => {
    const db = ctx.db as unknown as ContractDb;
    await checkOrgPermission({
      clerkUserId: ctx.auth.clerkUserId,
      organisationId: input.organisationId,
      action: "contract:read",
      findMembership: createOrganisationMembershipFinder(db),
    });

    const contract = await db.contract.findFirst({
      where: { id: input.id, organisationId: input.organisationId },
      include: {
        lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        events: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });

    if (!contract) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Contract was not found in this organisation.",
      });
    }

    return {
      ...contract,
      lineItems: contract.lineItems.map((item) => ({
        ...item,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        total: item.total?.toString() ?? null,
      })),
      fieldData: {
        ...(typeof contract.fieldData === "object" && contract.fieldData
          ? contract.fieldData
          : {}),
        items: readItemsFromFieldData(contract.fieldData),
      },
    };
  }),

  create: protectedProcedure
    .input(contractCreateInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as ContractDb;
      await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "contract:create",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        return await db.$transaction(async (tx) => {
          const created = await tx.contract.create({
            data: {
              organisationId: input.organisationId,
              sourceType: "JSON",
              clientName: input.contract.clientName,
              poRefNo: input.contract.poRefNo,
              poDate: input.contract.poDate,
              paymentTerms: input.contract.paymentTerms,
              deliveryTerms: input.contract.deliveryTerms,
              fieldData: buildContractFieldData({
                contract: input.contract,
                items: [],
              }),
              createdByClerkUserId: ctx.auth.clerkUserId,
            },
            include: {
              lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              events: { orderBy: { createdAt: "desc" }, take: 30 },
            },
          });

          await tx.contractEvent.create({
            data: {
              contractId: created.id,
              organisationId: input.organisationId,
              actorClerkUserId: ctx.auth.clerkUserId,
              eventType: "CREATE",
              payload: {
                sourceType: "JSON",
                poRefNo: created.poRefNo,
              },
            },
          });

          return {
            ...created,
            lineItems: created.lineItems.map((item) => ({
              ...item,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
              total: item.total?.toString() ?? null,
            })),
          };
        });
      } catch (error) {
        return mapWriteError(error);
      }
    }),

  update: protectedProcedure
    .input(contractUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as ContractDb;
      await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "contract:update",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        return await db.$transaction(async (tx) => {
          const existing = await tx.contract.findFirst({
            where: { id: input.id, organisationId: input.organisationId },
            include: {
              lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              events: { orderBy: { createdAt: "desc" }, take: 30 },
            },
          });

          if (!existing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Contract was not found in this organisation.",
            });
          }

          assertDraftContract(existing);

          const existingItems = existing.lineItems.map((lineItem) => ({
            description: lineItem.description,
            quantity: Number(lineItem.quantity.toString()),
            quantity_unit: lineItem.quantityUnit ?? undefined,
            unit_price: Number(lineItem.unitPrice.toString()),
            pricing_unit: lineItem.pricingUnit ?? undefined,
            total: Number(lineItem.total?.toString() ?? "0"),
          }));

          const updated = await tx.contract.update({
            where: { id: existing.id },
            data: {
              clientName: input.contract.clientName,
              poRefNo: input.contract.poRefNo,
              poDate: input.contract.poDate,
              paymentTerms: input.contract.paymentTerms,
              deliveryTerms: input.contract.deliveryTerms,
              fieldData: buildContractFieldData({
                contract: input.contract,
                items: existingItems,
              }),
            },
            include: {
              lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              events: { orderBy: { createdAt: "desc" }, take: 30 },
            },
          });

          await tx.contractEvent.create({
            data: {
              contractId: updated.id,
              organisationId: input.organisationId,
              actorClerkUserId: ctx.auth.clerkUserId,
              eventType: "UPDATE",
              payload: {
                poRefNo: updated.poRefNo,
                changedFields: ["clientName", "poRefNo", "poDate", "terms"],
              },
            },
          });

          return {
            ...updated,
            lineItems: updated.lineItems.map((item) => ({
              ...item,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
              total: item.total?.toString() ?? null,
            })),
          };
        });
      } catch (error) {
        return mapWriteError(error);
      }
    }),
});
