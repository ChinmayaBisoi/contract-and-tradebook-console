import { z } from "zod";

import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
} from "@/lib/organisation-access";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const actions = [
  "CREATE",
  "UPDATE",
  "STATUS_CHANGE",
  "DELETE",
  "IMPORT",
  "ROLE_CHANGE",
  "INVITE",
  "ACCEPT",
  "DECLINE",
  "CANCEL",
] as const;
const entityTypes = [
  "CONTRACT",
  "LINE_ITEM",
  "UPLOAD",
  "TRADEBOOK_IMPORT",
  "ORGANISATION_USER",
  "INVITATION",
] as const;

const auditListInput = z.object({
  organisationId: z.string().min(1),
  filters: z
    .object({
      search: z.string().trim().max(100).optional(),
      action: z.enum(actions).optional(),
      entityType: z.enum(entityTypes).optional(),
      actorId: z.string().min(1).optional(),
      contractId: z.string().min(1).optional(),
      occurredFrom: z.coerce.date().optional(),
      occurredTo: z.coerce.date().optional(),
    })
    .default({}),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]).default(10),
  sort: z
    .enum(["occurredAt", "actorName", "action", "entityType"])
    .default("occurredAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

type AuditDb = {
  organisationUser: { findUnique: (args: unknown) => Promise<unknown> };
  auditEvent: {
    findMany: (args: unknown) => Promise<AuditResult[]>;
    count: (args: unknown) => Promise<number>;
  };
};

type AuditResult = {
  id: string;
  organisationId: string;
  actorClerkUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: "OWNER" | "ADMIN" | "MEMBER" | null;
  action: (typeof actions)[number];
  entityType: (typeof entityTypes)[number];
  entityId: string;
  entityLabel: string | null;
  beforeState: unknown;
  afterState: unknown;
  changedFields: string[];
  metadata: unknown;
  contractId: string | null;
  lineItemId: string | null;
  uploadId: string | null;
  tradebookImportId: string | null;
  organisationUserId: string | null;
  invitationId: string | null;
  occurredAt: Date;
};

export const auditRouter = createTRPCRouter({
  list: protectedProcedure
    .input(auditListInput)
    .query(async ({ ctx, input }) => {
      const db = ctx.db as unknown as AuditDb;
      await checkOrgPermission({
        clerkUserId: ctx.auth.clerkUserId,
        organisationId: input.organisationId,
        action: "audit:read",
        findMembership: createOrganisationMembershipFinder(db as never),
      });

      const where: Record<string, unknown> = {
        organisationId: input.organisationId,
      };
      if (input.filters.action) where.action = input.filters.action;
      if (input.filters.entityType) where.entityType = input.filters.entityType;
      if (input.filters.actorId) where.actorClerkUserId = input.filters.actorId;
      if (input.filters.contractId) where.contractId = input.filters.contractId;
      if (input.filters.search) {
        where.OR = [
          {
            actorName: { contains: input.filters.search, mode: "insensitive" },
          },
          {
            actorEmail: { contains: input.filters.search, mode: "insensitive" },
          },
          {
            entityLabel: {
              contains: input.filters.search,
              mode: "insensitive",
            },
          },
          { entityId: { contains: input.filters.search, mode: "insensitive" } },
        ];
      }
      if (input.filters.occurredFrom || input.filters.occurredTo) {
        where.occurredAt = {
          ...(input.filters.occurredFrom
            ? { gte: input.filters.occurredFrom }
            : {}),
          ...(input.filters.occurredTo
            ? { lte: input.filters.occurredTo }
            : {}),
        };
      }

      const [rows, total, actorRows] = await Promise.all([
        db.auditEvent.findMany({
          where,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          orderBy: { [input.sort]: input.sortDirection },
        }),
        db.auditEvent.count({ where }),
        db.auditEvent.findMany({
          where: {
            organisationId: input.organisationId,
            actorClerkUserId: { not: null },
          },
          distinct: ["actorClerkUserId"],
          orderBy: { occurredAt: "desc" },
          select: { actorClerkUserId: true, actorName: true, actorEmail: true },
        }),
      ]);

      return {
        data: rows,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total,
          pageCount: Math.ceil(total / input.pageSize),
        },
        facets: {
          actions,
          entityTypes,
          actors: actorRows
            .filter((row) => row.actorClerkUserId)
            .map((row) => ({
              id: row.actorClerkUserId as string,
              name: row.actorName ?? row.actorEmail ?? "Unknown user",
              email: row.actorEmail ?? "",
            })),
        },
      };
    }),
});
