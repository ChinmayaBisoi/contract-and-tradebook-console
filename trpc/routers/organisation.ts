import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
  type OrganisationUserStatus,
} from "@/lib/organisation-access";
import type { OrganisationUserRole } from "@/lib/permissions";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const roleSchema = z.enum(["OWNER", "MANAGER", "MEMBER"]);
const statusSchema = z.enum(["ACTIVE", "DISABLED"]);

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
};

type OrganisationRouterDb = {
  organisation: {
    findMany: (args: unknown) => Promise<OrganisationWithMembership[]>;
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

function formatOrganisationWithMembership(
  organisation: OrganisationWithMembership,
) {
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
  action:
    | "organisation:read"
    | "organisation:update"
    | "organisation:delete"
    | "organisation:user:invite"
    | "organisation:user:remove"
    | "organisation:user:status:update";
}) {
  const db = getOrganisationDb(ctx);

  return checkOrgPermission({
    clerkUserId: ctx.auth.clerkUserId,
    organisationId,
    action,
    findMembership: createOrganisationMembershipFinder(db),
  });
}

async function ensureManagerCanOnlyManageMembers({
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
  if (requesterRole !== "MANAGER") {
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
      message: "Managers can only manage organisation members.",
    });
  }
}

export const organisationRouter = createTRPCRouter({
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

    return organisations.map(formatOrganisationWithMembership);
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

  inviteMember: protectedProcedure
    .input(
      z.object({
        organisationId: z.string().min(1),
        clerkUserId: z.string().min(1),
        clerkUserName: z.string().trim().default(""),
        clerkUserEmail: z.email(),
        role: roleSchema.default("MEMBER"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getOrganisationDb(ctx);
      const requester = await checkPermission({
        ctx,
        organisationId: input.organisationId,
        action: "organisation:user:invite",
      });

      if (requester.role === "MANAGER" && input.role !== "MEMBER") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Managers can only invite organisation members.",
        });
      }

      return db.organisationUser.create({
        data: {
          clerkUserId: input.clerkUserId,
          clerkUserName: input.clerkUserName,
          clerkUserEmail: input.clerkUserEmail.toLowerCase(),
          organisationId: input.organisationId,
          role: input.role,
          status: "ACTIVE",
          statusChangedAt: new Date(),
        },
      });
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

      await ensureManagerCanOnlyManageMembers({
        ctx,
        requesterRole: requester.role,
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

      await ensureManagerCanOnlyManageMembers({
        ctx,
        requesterRole: requester.role,
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
          status: input.status,
          statusChangedAt: new Date(),
        },
      });
    }),
});
