import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
  type OrganisationUserStatus,
} from "@/lib/organisation-access";
import type { OrganisationUserRole } from "@/lib/permissions";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

type InvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED";

type InvitationRecord = {
  id: string;
  email: string;
  organisationId: string;
  role: OrganisationUserRole;
  inviterClerkUserId?: string;
  inviterName?: string;
  inviterEmail?: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  organisation?: {
    id: string;
    name: string;
    users: Array<{
      role: OrganisationUserRole;
      status: OrganisationUserStatus;
    }>;
  };
};

type MembershipRecord = {
  role: OrganisationUserRole;
  status: OrganisationUserStatus;
};

type InvitationRouterDb = {
  invitation: {
    findMany: (args: unknown) => Promise<InvitationRecord[]>;
    count: (args: unknown) => Promise<number>;
    findUnique: (args: unknown) => Promise<InvitationRecord | null>;
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<InvitationRecord | { id: string }>;
    update: (args: unknown) => Promise<InvitationRecord>;
  };
  organisationUser: {
    findUnique: (args: unknown) => Promise<MembershipRecord | null>;
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    upsert: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(
    callback: (tx: InvitationRouterDb) => Promise<T>,
  ) => Promise<T>;
};

const invitationRoleSchema = z.enum(["ADMIN", "MEMBER"]);
const invitationStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
]);
const invitationIdInput = z.object({ id: z.string().min(1) });

const invitationListInput = z.object({
  filters: z
    .object({
      direction: z.enum(["all", "received", "managed"]).default("all"),
      search: z.string().trim().max(100).optional(),
      status: invitationStatusSchema.optional(),
    })
    .default({ direction: "all" }),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]).default(10),
  sort: z.enum(["createdAt", "email", "expiresAt"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

function getInvitationDb(ctx: { db: unknown }) {
  return ctx.db as InvitationRouterDb;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getInvitation(db: InvitationRouterDb, id: string) {
  const invitation = await db.invitation.findUnique({ where: { id } });

  if (!invitation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Invitation was not found.",
    });
  }

  return invitation;
}

async function getOrganisationPermission({
  ctx,
  organisationId,
  action,
}: {
  ctx: { auth: { clerkUserId: string }; db: unknown };
  organisationId: string;
  action:
    | "organisation:user:invite"
    | "organisation:invitation:update"
    | "organisation:invitation:cancel";
}) {
  const db = getInvitationDb(ctx);
  return checkOrgPermission({
    clerkUserId: ctx.auth.clerkUserId,
    organisationId,
    action,
    findMembership: createOrganisationMembershipFinder(db),
  });
}

async function ensurePending(
  db: InvitationRouterDb,
  invitation: InvitationRecord,
) {
  if (invitation.status !== "PENDING") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This invitation is no longer pending.",
    });
  }

  if (invitation.expiresAt <= new Date()) {
    await db.invitation.update({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This invitation has expired.",
    });
  }
}

function ensureRecipient(invitation: InvitationRecord, email: string) {
  if (normalizeEmail(invitation.email) !== normalizeEmail(email)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This invitation belongs to a different email address.",
    });
  }
}

function formatInvitation(invitation: InvitationRecord, currentEmail: string) {
  const membership = invitation.organisation?.users[0];
  const isReceived =
    normalizeEmail(invitation.email) === normalizeEmail(currentEmail);
  const isManaged =
    membership?.status === "ACTIVE" &&
    (membership.role === "OWNER" || membership.role === "ADMIN");
  const isPending =
    invitation.status === "PENDING" && invitation.expiresAt > new Date();
  const status =
    invitation.status === "PENDING" && invitation.expiresAt <= new Date()
      ? "EXPIRED"
      : invitation.status;

  return {
    id: invitation.id,
    email: invitation.email,
    organisationId: invitation.organisationId,
    organisationName: invitation.organisation?.name ?? "Unknown organisation",
    role: invitation.role,
    inviterName: invitation.inviterName ?? "Unknown user",
    inviterEmail: invitation.inviterEmail ?? "",
    status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
    direction:
      isReceived && isManaged ? "both" : isReceived ? "received" : "managed",
    canAccept: isReceived && isPending,
    canDecline: isReceived && isPending,
    canEdit:
      Boolean(isManaged && isPending) &&
      (membership?.role === "OWNER" || invitation.role === "MEMBER"),
    canCancel: membership?.role === "OWNER" && isPending,
  };
}

export const invitationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(invitationListInput)
    .query(async ({ ctx, input }) => {
      const db = getInvitationDb(ctx);
      const email = normalizeEmail(ctx.auth.email);
      const managedScope = {
        organisation: {
          users: {
            some: {
              clerkUserId: ctx.auth.clerkUserId,
              status: "ACTIVE" as const,
              role: { in: ["OWNER", "ADMIN"] as const },
            },
          },
        },
      };
      const visibilityScope =
        input.filters.direction === "received"
          ? { email }
          : input.filters.direction === "managed"
            ? managedScope
            : { OR: [{ email }, managedScope] };
      const where = {
        AND: [
          visibilityScope,
          ...(input.filters.search
            ? [
                {
                  OR: [
                    {
                      email: {
                        contains: input.filters.search,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      organisation: {
                        name: {
                          contains: input.filters.search,
                          mode: "insensitive" as const,
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
          ...(input.filters.status ? [{ status: input.filters.status }] : []),
        ],
      };
      const [invitations, total] = await Promise.all([
        db.invitation.findMany({
          where,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          orderBy: { [input.sort]: input.sortDirection },
          include: {
            organisation: {
              select: {
                id: true,
                name: true,
                users: {
                  where: { clerkUserId: ctx.auth.clerkUserId },
                  select: { role: true, status: true },
                },
              },
            },
          },
        }),
        db.invitation.count({ where }),
      ]);

      return {
        data: invitations.map((invitation) =>
          formatInvitation(invitation, email),
        ),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total,
          pageCount: Math.ceil(total / input.pageSize),
        },
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        organisationId: z.string().min(1),
        email: z.string().trim().pipe(z.email()),
        role: invitationRoleSchema.default("MEMBER"),
        expiresAt: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getInvitationDb(ctx);
      const requester = await getOrganisationPermission({
        ctx,
        organisationId: input.organisationId,
        action: "organisation:user:invite",
      });

      if (requester.role === "ADMIN" && input.role !== "MEMBER") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Administrators can only invite organisation members.",
        });
      }

      if (input.expiresAt <= new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation expiry must be in the future.",
        });
      }

      const email = normalizeEmail(input.email);
      const existingMembership = await db.organisationUser.findFirst({
        where: {
          organisationId: input.organisationId,
          clerkUserEmail: email,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      if (existingMembership) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This user is already an active organisation member.",
        });
      }

      const duplicate = await db.invitation.findFirst({
        where: {
          organisationId: input.organisationId,
          email,
          status: "PENDING",
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A pending invitation already exists for this email.",
        });
      }

      return db.invitation.create({
        data: {
          organisationId: input.organisationId,
          email,
          role: input.role,
          inviterClerkUserId: ctx.auth.clerkUserId,
          inviterName: ctx.auth.name ?? "",
          inviterEmail: normalizeEmail(ctx.auth.email),
          status: "PENDING",
          expiresAt: input.expiresAt,
        },
      });
    }),

  update: protectedProcedure
    .input(
      invitationIdInput.extend({
        role: invitationRoleSchema,
        expiresAt: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getInvitationDb(ctx);
      const invitation = await getInvitation(db, input.id);
      await ensurePending(db, invitation);
      const requester = await getOrganisationPermission({
        ctx,
        organisationId: invitation.organisationId,
        action: "organisation:invitation:update",
      });

      if (
        requester.role === "ADMIN" &&
        (invitation.role !== "MEMBER" || input.role !== "MEMBER")
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Administrators can only update member invitations.",
        });
      }

      if (input.expiresAt <= new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation expiry must be in the future.",
        });
      }

      return db.invitation.update({
        where: { id: input.id, status: "PENDING" },
        data: { role: input.role, expiresAt: input.expiresAt },
      });
    }),

  accept: protectedProcedure
    .input(invitationIdInput)
    .mutation(async ({ ctx, input }) => {
      const db = getInvitationDb(ctx);
      const invitation = await getInvitation(db, input.id);
      ensureRecipient(invitation, ctx.auth.email);
      await ensurePending(db, invitation);

      return db.$transaction(async (tx) => {
        await tx.organisationUser.upsert({
          where: {
            clerkUserId_organisationId: {
              clerkUserId: ctx.auth.clerkUserId,
              organisationId: invitation.organisationId,
            },
          },
          create: {
            clerkUserId: ctx.auth.clerkUserId,
            clerkUserName: ctx.auth.name ?? "",
            clerkUserEmail: normalizeEmail(ctx.auth.email),
            organisationId: invitation.organisationId,
            role: invitation.role,
            status: "ACTIVE",
            statusChangedAt: new Date(),
          },
          update: {
            clerkUserName: ctx.auth.name ?? "",
            clerkUserEmail: normalizeEmail(ctx.auth.email),
            role: invitation.role,
            status: "ACTIVE",
            statusChangedAt: new Date(),
          },
        });

        return tx.invitation.update({
          where: { id: invitation.id, status: "PENDING" },
          data: { status: "ACCEPTED" },
        });
      });
    }),

  decline: protectedProcedure
    .input(invitationIdInput)
    .mutation(async ({ ctx, input }) => {
      const db = getInvitationDb(ctx);
      const invitation = await getInvitation(db, input.id);
      ensureRecipient(invitation, ctx.auth.email);
      await ensurePending(db, invitation);

      return db.invitation.update({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "DECLINED" },
      });
    }),

  cancel: protectedProcedure
    .input(invitationIdInput)
    .mutation(async ({ ctx, input }) => {
      const db = getInvitationDb(ctx);
      const invitation = await getInvitation(db, input.id);
      await ensurePending(db, invitation);
      await getOrganisationPermission({
        ctx,
        organisationId: invitation.organisationId,
        action: "organisation:invitation:cancel",
      });

      return db.invitation.update({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    }),
});
