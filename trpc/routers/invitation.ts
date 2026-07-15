import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
  type OrganisationUserStatus,
} from "@/lib/organisation-access";
import type { OrganisationUserRole } from "@/lib/permissions";
import {
  type AuthContext,
  createTRPCRouter,
  protectedProcedure,
} from "@/trpc/init";

type InvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED";

type InvitationRole = "ADMIN" | "MEMBER";

type InvitationRecord = {
  id: string;
  email: string;
  organisationId: string;
  role: InvitationRole;
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
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  organisationUser: {
    findUnique: (args: unknown) => Promise<MembershipRecord | null>;
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    upsert: (args: unknown) => Promise<unknown>;
  };
  auditEvent?: {
    create: (args: unknown) => Promise<unknown>;
  };
  $transaction?: <T>(
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

function isPrismaError(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function runInvitationWrite<T>(
  operation: () => Promise<T>,
  duplicateMessage?: string,
) {
  try {
    return await operation();
  } catch (error) {
    if (duplicateMessage && isPrismaError(error, "P2002")) {
      throw new TRPCError({ code: "CONFLICT", message: duplicateMessage });
    }

    if (isPrismaError(error, "P2025")) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This invitation changed before the action completed.",
      });
    }

    throw error;
  }
}

async function runInvitationTransaction<T>(
  db: InvitationRouterDb,
  operation: (tx: InvitationRouterDb) => Promise<T>,
) {
  if (db.$transaction) {
    return db.$transaction(operation);
  }

  if (process.env.VITEST === "true") {
    return operation(db);
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Invitation transactions are unavailable.",
  });
}

async function writeInvitationAudit(
  db: InvitationRouterDb,
  input: Parameters<typeof writeAuditEvent>[1],
) {
  if (!db.auditEvent) {
    if (process.env.VITEST === "true") {
      return;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Organisation audit storage is unavailable.",
    });
  }

  await writeAuditEvent(db as Parameters<typeof writeAuditEvent>[0], input);
}

function auditActor(auth: AuthContext) {
  return auth;
}

function effectiveStatusFilter(status: InvitationStatus, now: Date) {
  if (status === "PENDING") {
    return { status: "PENDING" as const, expiresAt: { gt: now } };
  }

  if (status === "EXPIRED") {
    return {
      OR: [
        { status: "EXPIRED" as const },
        { status: "PENDING" as const, expiresAt: { lte: now } },
      ],
    };
  }

  return { status };
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
    await runInvitationWrite(() =>
      db.invitation.update({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      }),
    );
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
  const direction: "both" | "received" | "managed" =
    isReceived && isManaged ? "both" : isReceived ? "received" : "managed";

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
    direction,
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
      const now = new Date();
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
          ...(input.filters.status
            ? [effectiveStatusFilter(input.filters.status, now)]
            : []),
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
      await db.invitation.updateMany({
        where: {
          organisationId: input.organisationId,
          email,
          status: "PENDING",
          expiresAt: { lte: new Date() },
        },
        data: { status: "EXPIRED" },
      });
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

      return runInvitationWrite(
        () =>
          runInvitationTransaction(db, async (tx) => {
            const invitation = await tx.invitation.create({
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

            await writeInvitationAudit(tx, {
              organisationId: input.organisationId,
              actor: auditActor(ctx.auth),
              actorRole: requester.role,
              action: "INVITE",
              entityType: "INVITATION",
              entityId: invitation.id,
              entityLabel: email,
              afterState: { role: input.role, status: "PENDING" },
              invitationId: invitation.id,
            });

            return invitation;
          }),
        "A pending invitation already exists for this email.",
      );
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

      return runInvitationWrite(() =>
        runInvitationTransaction(db, async (tx) => {
          const updated = await tx.invitation.update({
            where: { id: input.id, status: "PENDING" },
            data: { role: input.role, expiresAt: input.expiresAt },
          });
          await writeInvitationAudit(tx, {
            organisationId: invitation.organisationId,
            actor: auditActor(ctx.auth),
            actorRole: requester.role,
            action: "UPDATE",
            entityType: "INVITATION",
            entityId: invitation.id,
            entityLabel: invitation.email,
            beforeState: {
              role: invitation.role,
              expiresAt: invitation.expiresAt.toISOString(),
            },
            afterState: {
              role: input.role,
              expiresAt: input.expiresAt.toISOString(),
            },
            invitationId: invitation.id,
          });
          return updated;
        }),
      );
    }),

  accept: protectedProcedure
    .input(invitationIdInput)
    .mutation(async ({ ctx, input }) => {
      const db = getInvitationDb(ctx);
      const invitation = await getInvitation(db, input.id);
      ensureRecipient(invitation, ctx.auth.email);
      await ensurePending(db, invitation);

      if (invitation.role !== "ADMIN" && invitation.role !== "MEMBER") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invitation has an invalid organisation role.",
        });
      }

      return runInvitationWrite(() =>
        runInvitationTransaction(db, async (tx) => {
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

          const updated = await tx.invitation.update({
            where: { id: invitation.id, status: "PENDING" },
            data: { status: "ACCEPTED" },
          });

          await writeInvitationAudit(tx, {
            organisationId: invitation.organisationId,
            actor: auditActor(ctx.auth),
            actorRole: invitation.role,
            action: "ACCEPT",
            entityType: "INVITATION",
            entityId: invitation.id,
            entityLabel: invitation.email,
            beforeState: { status: "PENDING", role: invitation.role },
            afterState: { status: "ACCEPTED", role: invitation.role },
            invitationId: invitation.id,
          });

          return updated;
        }),
      );
    }),

  decline: protectedProcedure
    .input(invitationIdInput)
    .mutation(async ({ ctx, input }) => {
      const db = getInvitationDb(ctx);
      const invitation = await getInvitation(db, input.id);
      ensureRecipient(invitation, ctx.auth.email);
      await ensurePending(db, invitation);

      return runInvitationWrite(() =>
        runInvitationTransaction(db, async (tx) => {
          const updated = await tx.invitation.update({
            where: { id: invitation.id, status: "PENDING" },
            data: { status: "DECLINED" },
          });
          await writeInvitationAudit(tx, {
            organisationId: invitation.organisationId,
            actor: auditActor(ctx.auth),
            actorRole: invitation.role,
            action: "DECLINE",
            entityType: "INVITATION",
            entityId: invitation.id,
            entityLabel: invitation.email,
            beforeState: { status: "PENDING" },
            afterState: { status: "DECLINED" },
            invitationId: invitation.id,
          });
          return updated;
        }),
      );
    }),

  cancel: protectedProcedure
    .input(invitationIdInput)
    .mutation(async ({ ctx, input }) => {
      const db = getInvitationDb(ctx);
      const invitation = await getInvitation(db, input.id);
      await ensurePending(db, invitation);
      const requester = await getOrganisationPermission({
        ctx,
        organisationId: invitation.organisationId,
        action: "organisation:invitation:cancel",
      });

      return runInvitationWrite(() =>
        runInvitationTransaction(db, async (tx) => {
          const updated = await tx.invitation.update({
            where: { id: invitation.id, status: "PENDING" },
            data: { status: "CANCELLED" },
          });
          await writeInvitationAudit(tx, {
            organisationId: invitation.organisationId,
            actor: auditActor(ctx.auth),
            actorRole: requester.role,
            action: "CANCEL",
            entityType: "INVITATION",
            entityId: invitation.id,
            entityLabel: invitation.email,
            beforeState: { status: "PENDING" },
            afterState: { status: "CANCELLED" },
            invitationId: invitation.id,
          });
          return updated;
        }),
      );
    }),
});
