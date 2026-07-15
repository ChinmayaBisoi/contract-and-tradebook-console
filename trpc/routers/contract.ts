import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { buildAuditData, writeAuditEvent } from "@/lib/audit";
import { assertDraftContract } from "@/lib/contracts/assert-draft-contract";
import { buildContractFieldData } from "@/lib/contracts/contract-field-data";
import { contractInputSchema } from "@/lib/contracts/contract-schemas";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
} from "@/lib/organisation-access";
import { publishRealtimeEvent } from "@/lib/realtime/events";
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

const contractDeleteInput = z.object({
  organisationId: z.string().min(1),
  id: z.string().min(1),
});

const contractUpdateStatusInput = z.object({
  organisationId: z.string().min(1),
  id: z.string().min(1),
  status: z.enum(["FINALIZED", "ARCHIVED"]),
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
  total: string | { toString(): string };
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
    delete: (args: unknown) => Promise<unknown>;
  };
  auditEvent: {
    create: (args: {
      data: ReturnType<typeof buildAuditData>;
    }) => Promise<unknown>;
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
  total: { toString(): string };
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
  auditEvents?: unknown[];
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

function mapContract(contract: ContractWithRelations) {
  return {
    ...contract,
    total: contract.total.toString(),
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
}

function validateContractStatusTransition({
  current,
  next,
}: {
  current: "DRAFT" | "FINALIZED" | "ARCHIVED";
  next: "FINALIZED" | "ARCHIVED";
}) {
  if (current === "DRAFT" && next === "FINALIZED") return;
  if (current === "FINALIZED" && next === "ARCHIVED") return;
  throw new TRPCError({
    code: "CONFLICT",
    message: `Contract status cannot change from ${current} to ${next}.`,
  });
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
              COALESCE(contract."total", 0)::text AS "total",
              COUNT(line_item."id")::integer AS "itemCount",
              COALESCE(SUM(line_item."total"), 0)::text AS "lineTotal"
            FROM "Contract" AS contract
            LEFT JOIN "LineItem" AS line_item ON line_item."contractId" = contract."id"
            WHERE ${Prisma.join(conditions, " AND ")}
            GROUP BY contract."id", contract."total"
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
          total: (row.total ?? row.lineTotal).toString(),
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
        auditEvents: { orderBy: { occurredAt: "desc" }, take: 30 },
      },
    });

    if (!contract) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Contract was not found in this organisation.",
      });
    }

    return mapContract(contract);
  }),

  create: protectedProcedure
    .input(contractCreateInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as ContractDb;
      const membership = await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "contract:create",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        const created = await db.$transaction(async (tx) => {
          const created = await tx.contract.create({
            data: {
              organisationId: input.organisationId,
              sourceType: "JSON",
              clientName: input.contract.clientName,
              poRefNo: input.contract.poRefNo,
              poDate: input.contract.poDate,
              paymentTerms: input.contract.paymentTerms,
              deliveryTerms: input.contract.deliveryTerms,
              total: new Prisma.Decimal(0),
              fieldData: buildContractFieldData({
                contract: input.contract,
                items: [],
              }),
              createdByClerkUserId: ctx.auth.clerkUserId,
            },
            include: {
              lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              auditEvents: { orderBy: { occurredAt: "desc" }, take: 30 },
            },
          });

          await writeAuditEvent(tx, {
            organisationId: input.organisationId,
            actor: ctx.auth,
            actorRole: membership.role,
            action: "CREATE",
            entityType: "CONTRACT",
            entityId: created.id,
            entityLabel: created.poRefNo,
            contractId: created.id,
            afterState: {
              clientName: created.clientName,
              poRefNo: created.poRefNo,
              poDate: created.poDate,
              status: created.status,
              sourceType: created.sourceType,
            },
          });

          return mapContract(created);
        });

        publishRealtimeEvent({
          entity: "contract",
          action: "created",
          entityId: created.id,
          organisationId: input.organisationId,
          contractId: created.id,
        });

        return created;
      } catch (error) {
        return mapWriteError(error);
      }
    }),

  update: protectedProcedure
    .input(contractUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as ContractDb;
      const membership = await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "contract:update",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        const updated = await db.$transaction(async (tx) => {
          const existing = await tx.contract.findFirst({
            where: { id: input.id, organisationId: input.organisationId },
            include: {
              lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              auditEvents: { orderBy: { occurredAt: "desc" }, take: 30 },
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
              paymentTerms: input.contract.paymentTerms ?? null,
              deliveryTerms: input.contract.deliveryTerms ?? null,
              fieldData: buildContractFieldData({
                contract: input.contract,
                items: existingItems,
              }),
            },
            include: {
              lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              auditEvents: { orderBy: { occurredAt: "desc" }, take: 30 },
            },
          });

          await writeAuditEvent(tx, {
            organisationId: input.organisationId,
            actor: ctx.auth,
            actorRole: membership.role,
            action: "UPDATE",
            entityType: "CONTRACT",
            entityId: updated.id,
            entityLabel: updated.poRefNo,
            contractId: updated.id,
            beforeState: {
              clientName: existing.clientName,
              poRefNo: existing.poRefNo,
              poDate: existing.poDate,
              paymentTerms: existing.paymentTerms,
              deliveryTerms: existing.deliveryTerms,
            },
            afterState: {
              clientName: updated.clientName,
              poRefNo: updated.poRefNo,
              poDate: updated.poDate,
              paymentTerms: updated.paymentTerms,
              deliveryTerms: updated.deliveryTerms,
            },
          });

          return mapContract(updated);
        });

        publishRealtimeEvent({
          entity: "contract",
          action: "updated",
          entityId: updated.id,
          organisationId: input.organisationId,
          contractId: updated.id,
        });

        return updated;
      } catch (error) {
        return mapWriteError(error);
      }
    }),

  updateStatus: protectedProcedure
    .input(contractUpdateStatusInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as ContractDb;
      const membership = await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "contract:update",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        const updated = await db.$transaction(async (tx) => {
          const existing = await tx.contract.findFirst({
            where: { id: input.id, organisationId: input.organisationId },
            include: {
              lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              auditEvents: { orderBy: { occurredAt: "desc" }, take: 30 },
            },
          });

          if (!existing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Contract was not found in this organisation.",
            });
          }

          validateContractStatusTransition({
            current: existing.status,
            next: input.status,
          });

          const now = new Date();
          const updated = await tx.contract.update({
            where: { id: existing.id },
            data: {
              status: input.status,
              finalizedAt: input.status === "FINALIZED" ? now : null,
              archivedAt: input.status === "ARCHIVED" ? now : null,
            },
            include: {
              lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              auditEvents: { orderBy: { occurredAt: "desc" }, take: 30 },
            },
          });

          await writeAuditEvent(tx, {
            organisationId: input.organisationId,
            actor: ctx.auth,
            actorRole: membership.role,
            action: "STATUS_CHANGE",
            entityType: "CONTRACT",
            entityId: updated.id,
            entityLabel: updated.poRefNo,
            contractId: updated.id,
            beforeState: { status: existing.status },
            afterState: { status: updated.status },
          });

          return mapContract(updated);
        });

        publishRealtimeEvent({
          entity: "contract",
          action: "updated",
          entityId: updated.id,
          organisationId: input.organisationId,
          contractId: updated.id,
          status: updated.status,
        });

        return updated;
      } catch (error) {
        return mapWriteError(error);
      }
    }),

  delete: protectedProcedure
    .input(contractDeleteInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as ContractDb;
      const membership = await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "contract:update",
        findMembership: createOrganisationMembershipFinder(db),
      });

      try {
        const deleted = await db.$transaction(async (tx) => {
          const existing = await tx.contract.findFirst({
            where: { id: input.id, organisationId: input.organisationId },
            include: {
              lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
              auditEvents: { orderBy: { occurredAt: "desc" }, take: 30 },
            },
          });

          if (!existing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Contract was not found in this organisation.",
            });
          }

          assertDraftContract(existing);

          await writeAuditEvent(tx, {
            organisationId: input.organisationId,
            actor: ctx.auth,
            actorRole: membership.role,
            action: "DELETE",
            entityType: "CONTRACT",
            entityId: existing.id,
            entityLabel: existing.poRefNo,
            contractId: existing.id,
            beforeState: {
              clientName: existing.clientName,
              poRefNo: existing.poRefNo,
              poDate: existing.poDate,
              paymentTerms: existing.paymentTerms,
              deliveryTerms: existing.deliveryTerms,
            },
          });

          await tx.contract.delete({
            where: { id: existing.id },
          });

          return { id: existing.id };
        });

        publishRealtimeEvent({
          entity: "contract",
          action: "deleted",
          entityId: deleted.id,
          organisationId: input.organisationId,
          contractId: deleted.id,
        });

        return deleted;
      } catch (error) {
        return mapWriteError(error);
      }
    }),
});
