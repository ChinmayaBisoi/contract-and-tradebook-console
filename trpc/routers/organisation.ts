import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
  type OrganisationUserStatus,
} from "@/lib/organisation-access";
import type {
  OrganisationAction,
  OrganisationUserRole,
} from "@/lib/permissions";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const roleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
const statusSchema = z.enum(["ACTIVE", "DISABLED"]);
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
      role: OrganisationUserRole;
      status: OrganisationUserStatus;
    } | null>;
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
  };
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

async function ensureAdminCanOnlyManageMembers({
  ctx,
  requesterRole,
  organisationId,
  targetClerkUserId,
}: {
  ctx: { db: unknown };
  requesterRole: OrganisationUserRole;
  organisationId: string;
  targetClerkUserId: string;
}) {
  if (requesterRole !== "ADMIN") {
    return;
  }

  const db = getOrganisationDb(ctx);
  const targetMembership = await db.organisationUser.findUnique({
    where: {
      clerkUserId_organisationId: {
        clerkUserId: targetClerkUserId,
        organisationId,
      },
    },
    select: {
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

  if (targetMembership.role !== "MEMBER") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Administrators can only manage organisation members.",
    });
  }
}

async function ensureNotLastActiveOwner({
  ctx,
  organisationId,
  targetClerkUserId,
}: {
  ctx: { db: unknown };
  organisationId: string;
  targetClerkUserId: string;
}) {
  const db = getOrganisationDb(ctx);
  const targetMembership = await db.organisationUser.findUnique({
    where: {
      clerkUserId_organisationId: {
        clerkUserId: targetClerkUserId,
        organisationId,
      },
    },
    select: { role: true, status: true },
  });

  if (
    targetMembership?.role !== "OWNER" ||
    targetMembership.status !== "ACTIVE"
  ) {
    return;
  }

  const activeOwnerCount = await db.organisationUser.count({
    where: { organisationId, role: "OWNER", status: "ACTIVE" },
  });

  if (activeOwnerCount <= 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An organisation must keep at least one active owner.",
    });
  }
}

export const organisationRouter = createTRPCRouter({
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

      await db.organisation.delete({
        where: { id: input.id },
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

      await ensureAdminCanOnlyManageMembers({
        ctx,
        requesterRole: requester.role,
        organisationId: input.organisationId,
        targetClerkUserId: input.clerkUserId,
      });

      await ensureNotLastActiveOwner({
        ctx,
        organisationId: input.organisationId,
        targetClerkUserId: input.clerkUserId,
      });

      return db.organisationUser.update({
        where: {
          clerkUserId_organisationId: {
            clerkUserId: input.clerkUserId,
            organisationId: input.organisationId,
          },
        },
        data: {
          status: "REMOVED",
          statusChangedAt: new Date(),
        },
      });
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

      await ensureAdminCanOnlyManageMembers({
        ctx,
        requesterRole: requester.role,
        organisationId: input.organisationId,
        targetClerkUserId: input.clerkUserId,
      });

      if (input.status !== "ACTIVE") {
        await ensureNotLastActiveOwner({
          ctx,
          organisationId: input.organisationId,
          targetClerkUserId: input.clerkUserId,
        });
      }

      return db.organisationUser.update({
        where: {
          clerkUserId_organisationId: {
            clerkUserId: input.clerkUserId,
            organisationId: input.organisationId,
          },
        },
        data: {
          status: input.status,
          statusChangedAt: new Date(),
        },
      });
    }),
});
