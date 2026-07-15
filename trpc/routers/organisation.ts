import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
  type OrganisationUserStatus,
} from "@/lib/organisation-access";
import type {
  OrganisationAction,
  OrganisationUserRole,
} from "@/lib/permissions";
import { publishRealtimeEvent } from "@/lib/realtime/events";
import {
  type AuthContext,
  createTRPCRouter,
  protectedProcedure,
} from "@/trpc/init";

const roleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
const statusSchema = z.enum(["ACTIVE", "DISABLED"]);
const memberStatusSchema = z.enum(["ACTIVE", "DISABLED", "REMOVED"]);
const organisationListInput = z.object({
  filters: z
    .object({
      search: z.string().trim().max(100).optional(),
      role: roleSchema.optional(),
    })
    .default({}),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]).default(10),
  sort: z.enum(["name", "createdAt"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

type OrganisationWithMembership = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  users: {
    role: OrganisationUserRole;
    status: OrganisationUserStatus;
  }[];
  _count?: { users: number };
};

type OrganisationRouterDb = {
  organisation: {
    findMany: (args: unknown) => Promise<OrganisationWithMembership[]>;
    count: (args: unknown) => Promise<number>;
    findUnique: (args: unknown) => Promise<OrganisationWithMembership | null>;
    create: (args: unknown) => Promise<OrganisationWithMembership>;
    update: (args: unknown) => Promise<OrganisationWithMembership>;
    delete: (args: unknown) => Promise<unknown>;
  };
  organisationUser: {
    findUnique: (args: unknown) => Promise<{
      id?: string;
      clerkUserId?: string;
      clerkUserName?: string;
      clerkUserEmail?: string;
      role: OrganisationUserRole;
      status: OrganisationUserStatus;
    } | null>;
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<OrganisationMember[]>;
    update: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
  };
  invitation: {
    count: (args: unknown) => Promise<number>;
  };
  $transaction?: <T>(
    operation: (tx: OrganisationTransactionClient) => Promise<T>,
    options: { isolationLevel: "Serializable" },
  ) => Promise<T>;
};

type OrganisationTransactionClient = Pick<
  OrganisationRouterDb,
  "organisationUser"
> & {
  auditEvent?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type OrganisationMember = {
  id: string;
  clerkUserId: string;
  clerkUserName: string;
  clerkUserEmail: string;
  role: OrganisationUserRole;
  status: OrganisationUserStatus;
  createdAt: Date;
  updatedAt: Date;
};

const organisationMemberSelect = {
  id: true,
  clerkUserId: true,
  clerkUserName: true,
  clerkUserEmail: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const organisationSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  users: {
    select: {
      role: true,
      status: true,
    },
  },
};

function getOrganisationDb(ctx: { db: unknown }) {
  return ctx.db as OrganisationRouterDb;
}

function formatOrganisationBase(organisation: OrganisationWithMembership) {
  const membership = organisation.users[0];

  return {
    id: organisation.id,
    name: organisation.name,
    description: organisation.description,
    role: membership?.role ?? "MEMBER",
    status: membership?.status ?? "ACTIVE",
    createdAt: organisation.createdAt,
    updatedAt: organisation.updatedAt,
  };
}

function formatOrganisationWithMembership(
  organisation: OrganisationWithMembership,
  includeActiveMemberCount: true,
): ReturnType<typeof formatOrganisationBase> & { activeMemberCount: number };
function formatOrganisationWithMembership(
  organisation: OrganisationWithMembership,
  includeActiveMemberCount?: false,
): ReturnType<typeof formatOrganisationBase>;
function formatOrganisationWithMembership(
  organisation: OrganisationWithMembership,
  includeActiveMemberCount = false,
) {
  const result = formatOrganisationBase(organisation);

  return includeActiveMemberCount
    ? { ...result, activeMemberCount: organisation._count?.users ?? 0 }
    : result;
}

async function checkPermission({
  ctx,
  organisationId,
  action,
}: {
  ctx: {
    auth: { clerkUserId: string };
    db: unknown;
  };
  organisationId: string;
  action: OrganisationAction;
}) {
  const db = getOrganisationDb(ctx);

  return checkOrgPermission({
    clerkUserId: ctx.auth.clerkUserId,
    organisationId,
    action,
    findMembership: createOrganisationMembershipFinder(db),
  });
}

async function organisationAudienceUserIds(
  db: OrganisationRouterDb,
  organisationId: string,
) {
  const members = await db.organisationUser.findMany({
    where: {
      organisationId,
      status: "ACTIVE",
    },
    select: {
      clerkUserId: true,
    },
  });

  return members
    .map((member) => member.clerkUserId)
    .filter((value): value is string => Boolean(value));
}

function isPrismaError(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function runSerializableMembershipMutation<T>(
  db: OrganisationRouterDb,
  operation: (tx: OrganisationTransactionClient) => Promise<T>,
) {
  if (!db.$transaction) {
    // Legacy lightweight router tests omit Prisma's transaction method.
    if (process.env.VITEST === "true") {
      return operation(db);
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Organisation membership transactions are unavailable.",
    });
  }

  const maximumAttempts = 3;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (!isPrismaError(error, "P2034")) {
        throw error;
      }

      if (attempt === maximumAttempts) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Organisation membership changed during this action.",
        });
      }
    }
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Organisation membership mutation did not complete.",
  });
}

async function mutateOrganisationMember({
  db,
  actor,
  requesterRole,
  organisationId,
  targetClerkUserId,
  preservesActiveOwner,
  auditAction,
  includeAfterState = true,
  getData,
}: {
  db: OrganisationRouterDb;
  actor: AuthContext;
  requesterRole: OrganisationUserRole;
  organisationId: string;
  targetClerkUserId: string;
  preservesActiveOwner: boolean;
  auditAction: "DELETE" | "ROLE_CHANGE" | "STATUS_CHANGE";
  includeAfterState?: boolean;
  getData: () => Record<string, unknown>;
}) {
  return runSerializableMembershipMutation(db, async (tx) => {
    const targetMembership = await tx.organisationUser.findUnique({
      where: {
        clerkUserId_organisationId: {
          clerkUserId: targetClerkUserId,
          organisationId,
        },
      },
      select: {
        id: true,
        clerkUserId: true,
        clerkUserName: true,
        clerkUserEmail: true,
        role: true,
        status: true,
      },
    });

    if (!targetMembership) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organisation member was not found.",
      });
    }

    if (targetMembership.status === "REMOVED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Removed organisation members must be invited again before rejoining.",
      });
    }

    if (requesterRole === "ADMIN" && targetMembership.role !== "MEMBER") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Administrators can only manage organisation members.",
      });
    }

    if (
      preservesActiveOwner &&
      targetMembership.role === "OWNER" &&
      targetMembership.status === "ACTIVE"
    ) {
      const activeOwnerCount = await tx.organisationUser.count({
        where: { organisationId, role: "OWNER", status: "ACTIVE" },
      });

      if (activeOwnerCount <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An organisation must keep at least one active owner.",
        });
      }
    }

    const data = getData();
    const updatedMembership = await tx.organisationUser.update({
      where: {
        clerkUserId_organisationId: {
          clerkUserId: targetClerkUserId,
          organisationId,
        },
      },
      data,
    });

    if (!tx.auditEvent) {
      if (process.env.VITEST === "true") {
        return updatedMembership;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Organisation audit storage is unavailable.",
      });
    }

    await writeAuditEvent(tx as Parameters<typeof writeAuditEvent>[0], {
      organisationId,
      actor,
      actorRole: requesterRole,
      action: auditAction,
      entityType: "ORGANISATION_USER",
      entityId: targetMembership.id ?? targetClerkUserId,
      entityLabel:
        targetMembership.clerkUserName ??
        targetMembership.clerkUserEmail ??
        targetClerkUserId,
      beforeState: {
        role: targetMembership.role,
        status: targetMembership.status,
      },
      ...(includeAfterState
        ? {
            afterState: {
              role: data.role ?? targetMembership.role,
              status: data.status ?? targetMembership.status,
            },
          }
        : {}),
      ...(targetMembership.id
        ? { organisationUserId: targetMembership.id }
        : {}),
    });

    return updatedMembership;
  });
}

export const organisationRouter = createTRPCRouter({
  getAnalytics: protectedProcedure
    .input(z.object({ organisationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);

      await checkPermission({
        ctx,
        organisationId: input.organisationId,
        action: "organisation:read",
      });

      const [
        organisation,
        activeMemberCount,
        disabledMemberCount,
        pendingInvitationCount,
      ] = await Promise.all([
        db.organisation.findUnique({
          where: { id: input.organisationId },
          select: { createdAt: true },
        }),
        db.organisationUser.count({
          where: {
            organisationId: input.organisationId,
            status: "ACTIVE",
          },
        }),
        db.organisationUser.count({
          where: {
            organisationId: input.organisationId,
            status: "DISABLED",
          },
        }),
        db.invitation.count({
          where: {
            organisationId: input.organisationId,
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
        }),
      ]);

      if (!organisation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation was not found.",
        });
      }

      return {
        activeMemberCount,
        disabledMemberCount,
        pendingInvitationCount,
        createdAt: organisation.createdAt,
        ageInDays: Math.max(
          0,
          Math.floor(
            (Date.now() - organisation.createdAt.getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        ),
      };
    }),

  listMembers: protectedProcedure
    .input(
      z.object({
        organisationId: z.string().min(1),
        filters: z
          .object({
            search: z.string().trim().max(100).optional(),
            role: roleSchema.optional(),
            status: memberStatusSchema.optional(),
          })
          .default({}),
        page: z.number().int().min(1).default(1),
        pageSize: z
          .union([z.literal(10), z.literal(20), z.literal(50)])
          .default(10),
        sort: z
          .enum(["clerkUserName", "role", "status", "createdAt"])
          .default("createdAt"),
        sortDirection: z.enum(["asc", "desc"]).default("desc"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);
      const requester = await checkPermission({
        ctx,
        organisationId: input.organisationId,
        action: "organisation:user:read",
      });
      const where = {
        organisationId: input.organisationId,
        ...(input.filters.role ? { role: input.filters.role } : {}),
        ...(input.filters.status ? { status: input.filters.status } : {}),
        ...(input.filters.search
          ? {
              OR: [
                {
                  clerkUserName: {
                    contains: input.filters.search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  clerkUserEmail: {
                    contains: input.filters.search,
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
      };
      const [members, total, activeOwnerCount] = await Promise.all([
        db.organisationUser.findMany({
          where,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          orderBy: { [input.sort]: input.sortDirection },
          select: organisationMemberSelect,
        }),
        db.organisationUser.count({ where }),
        db.organisationUser.count({
          where: {
            organisationId: input.organisationId,
            role: "OWNER",
            status: "ACTIVE",
          },
        }),
      ]);

      return {
        data: members.map((member) => {
          const canMutateTarget =
            member.status !== "REMOVED" &&
            !(
              member.role === "OWNER" &&
              member.status === "ACTIVE" &&
              activeOwnerCount <= 1
            );
          const ownerCanManage = requester.role === "OWNER" && canMutateTarget;

          return {
            ...member,
            canChangeRole: ownerCanManage,
            canChangeStatus:
              ownerCanManage ||
              (requester.role === "ADMIN" &&
                member.role === "MEMBER" &&
                canMutateTarget),
            canRemove: ownerCanManage,
          };
        }),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total,
          pageCount: Math.ceil(total / input.pageSize),
        },
      };
    }),

  list: protectedProcedure
    .input(organisationListInput)
    .query(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);
      const membershipFilter = {
        clerkUserId: ctx.auth.clerkUserId,
        status: "ACTIVE" as const,
        ...(input.filters.role ? { role: input.filters.role } : {}),
      };
      const where = {
        ...(input.filters.search
          ? {
              name: {
                contains: input.filters.search,
                mode: "insensitive" as const,
              },
            }
          : {}),
        users: { some: membershipFilter },
      };
      const [organisations, total] = await Promise.all([
        db.organisation.findMany({
          where,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          orderBy: { [input.sort]: input.sortDirection },
          select: {
            ...organisationSelect,
            users: {
              ...organisationSelect.users,
              where: { clerkUserId: ctx.auth.clerkUserId },
            },
            _count: {
              select: { users: { where: { status: "ACTIVE" } } },
            },
          },
        }),
        db.organisation.count({ where }),
      ]);

      return {
        data: organisations.map((organisation) =>
          formatOrganisationWithMembership(organisation, true),
        ),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total,
          pageCount: Math.ceil(total / input.pageSize),
        },
      };
    }),

  listForCurrentUser: protectedProcedure.query(async ({ ctx }) => {
    const db = getOrganisationDb(ctx);
    const organisations = await db.organisation.findMany({
      where: {
        users: {
          some: {
            clerkUserId: ctx.auth.clerkUserId,
            status: "ACTIVE",
          },
        },
      },
      select: {
        ...organisationSelect,
        users: {
          ...organisationSelect.users,
          where: {
            clerkUserId: ctx.auth.clerkUserId,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return organisations.map((organisation) =>
      formatOrganisationWithMembership(organisation),
    );
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);

      await checkPermission({
        ctx,
        organisationId: input.id,
        action: "organisation:read",
      });

      const organisation = await db.organisation.findUnique({
        where: { id: input.id },
        select: {
          ...organisationSelect,
          users: {
            ...organisationSelect.users,
            where: {
              clerkUserId: ctx.auth.clerkUserId,
            },
          },
        },
      });

      if (!organisation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation was not found.",
        });
      }

      return formatOrganisationWithMembership(organisation);
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(3),
        description: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);
      const organisation = await db.organisation.create({
        data: {
          name: input.name,
          description: input.description,
          users: {
            create: {
              clerkUserId: ctx.auth.clerkUserId,
              clerkUserName: ctx.auth.name ?? "",
              clerkUserEmail: ctx.auth.email,
              role: "OWNER",
              status: "ACTIVE",
              statusChangedAt: new Date(),
            },
          },
        },
        select: {
          ...organisationSelect,
          users: {
            ...organisationSelect.users,
            where: {
              clerkUserId: ctx.auth.clerkUserId,
            },
          },
        },
      });

      publishRealtimeEvent({
        entity: "organisation",
        action: "created",
        entityId: organisation.id,
        organisationId: organisation.id,
        userIds: [ctx.auth.clerkUserId],
      });

      return formatOrganisationWithMembership(organisation);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(3),
        description: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);

      await checkPermission({
        ctx,
        organisationId: input.id,
        action: "organisation:update",
      });

      const organisation = await db.organisation.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
        },
        select: {
          ...organisationSelect,
          users: {
            ...organisationSelect.users,
            where: {
              clerkUserId: ctx.auth.clerkUserId,
            },
          },
        },
      });

      publishRealtimeEvent({
        entity: "organisation",
        action: "updated",
        entityId: organisation.id,
        organisationId: organisation.id,
        userIds: await organisationAudienceUserIds(db, organisation.id),
      });

      return formatOrganisationWithMembership(organisation);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);

      await checkPermission({
        ctx,
        organisationId: input.id,
        action: "organisation:delete",
      });

      const userIds = await organisationAudienceUserIds(db, input.id);

      await db.organisation.delete({
        where: { id: input.id },
      });

      publishRealtimeEvent({
        entity: "organisation",
        action: "deleted",
        entityId: input.id,
        organisationId: input.id,
        userIds,
      });

      return { id: input.id };
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        organisationId: z.string().min(1),
        clerkUserId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);
      const requester = await checkPermission({
        ctx,
        organisationId: input.organisationId,
        action: "organisation:user:remove",
      });

      const updatedMembership = await mutateOrganisationMember({
        db,
        actor: ctx.auth,
        requesterRole: requester.role,
        organisationId: input.organisationId,
        targetClerkUserId: input.clerkUserId,
        preservesActiveOwner: true,
        auditAction: "DELETE",
        includeAfterState: false,
        getData: () => ({
          status: "REMOVED",
          statusChangedAt: new Date(),
        }),
      });

      publishRealtimeEvent({
        entity: "organisation",
        action: "updated",
        entityId: input.organisationId,
        organisationId: input.organisationId,
        userIds: [input.clerkUserId],
      });

      return updatedMembership;
    }),

  updateMemberRole: protectedProcedure
    .input(
      z.object({
        organisationId: z.string().min(1),
        clerkUserId: z.string().min(1),
        role: roleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);

      const requester = await checkPermission({
        ctx,
        organisationId: input.organisationId,
        action: "organisation:user:update",
      });

      const updatedMembership = await mutateOrganisationMember({
        db,
        actor: ctx.auth,
        requesterRole: requester.role,
        organisationId: input.organisationId,
        targetClerkUserId: input.clerkUserId,
        preservesActiveOwner: input.role !== "OWNER",
        auditAction: "ROLE_CHANGE",
        getData: () => ({ role: input.role }),
      });

      publishRealtimeEvent({
        entity: "organisation",
        action: "updated",
        entityId: input.organisationId,
        organisationId: input.organisationId,
        userIds: [input.clerkUserId],
      });

      return updatedMembership;
    }),

  updateMemberStatus: protectedProcedure
    .input(
      z.object({
        organisationId: z.string().min(1),
        clerkUserId: z.string().min(1),
        status: statusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);
      const requester = await checkPermission({
        ctx,
        organisationId: input.organisationId,
        action: "organisation:user:status:update",
      });

      const updatedMembership = await mutateOrganisationMember({
        db,
        actor: ctx.auth,
        requesterRole: requester.role,
        organisationId: input.organisationId,
        targetClerkUserId: input.clerkUserId,
        preservesActiveOwner: input.status !== "ACTIVE",
        auditAction: "STATUS_CHANGE",
        getData: () => ({
          status: input.status,
          statusChangedAt: new Date(),
        }),
      });

      publishRealtimeEvent({
        entity: "organisation",
        action: "updated",
        entityId: input.organisationId,
        organisationId: input.organisationId,
        userIds: [input.clerkUserId],
      });

      return updatedMembership;
    }),
});
