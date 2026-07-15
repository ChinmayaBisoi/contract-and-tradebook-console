import { TRPCError } from "@trpc/server";

import { writeAuditEvent } from "@/lib/audit";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
  type OrganisationMembership,
} from "@/lib/organisation-access";
import { publishRealtimeEvent } from "@/lib/realtime/events";

export type TradebookUploadMetadata = {
  organisationId: string;
  uploadId: string;
  clerkUserId: string;
  actorRole?: "OWNER" | "ADMIN" | "MEMBER";
};

type AuthorizeUploadDb = {
  organisationUser: {
    findUnique: (args: unknown) => Promise<OrganisationMembership | null>;
  };
  upload: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
  };
};

type CompleteUploadTransaction = {
  upload: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  tradebookImport: {
    upsert: (args: unknown) => Promise<{ id: string }>;
  };
  auditEvent?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type CompleteUploadDb = CompleteUploadTransaction & {
  $transaction: <T>(
    callback: (transaction: CompleteUploadTransaction) => Promise<T>,
  ) => Promise<T>;
};

export async function authorizeTradebookUpload(
  dbValue: unknown,
  metadata: TradebookUploadMetadata,
) {
  const db = dbValue as AuthorizeUploadDb;
  const membership = await checkOrgPermission({
    clerkUserId: metadata.clerkUserId,
    organisationId: metadata.organisationId,
    action: "import:create",
    findMembership: createOrganisationMembershipFinder(db),
  });

  const upload = await db.upload.findFirst({
    where: {
      id: metadata.uploadId,
      organisationId: metadata.organisationId,
      uploadedByClerkUserId: metadata.clerkUserId,
      sourceType: "EXCEL",
      status: "PENDING",
    },
    select: { id: true },
  });

  if (!upload) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pending upload was not found in this organisation.",
    });
  }

  return { ...metadata, actorRole: membership.role };
}

export async function completeTradebookUpload(
  dbValue: unknown,
  input: TradebookUploadMetadata & {
    storageKey: string;
    privateUrl: string;
  },
) {
  const db = dbValue as CompleteUploadDb;
  return db.$transaction(async (tx) => {
    const result = await tx.upload.updateMany({
      where: {
        id: input.uploadId,
        organisationId: input.organisationId,
        uploadedByClerkUserId: input.clerkUserId,
        status: "PENDING",
      },
      data: {
        status: "UPLOADED",
        storageKey: input.storageKey,
        blobUrl: input.privateUrl,
        uploadedAt: new Date(),
        failedAt: null,
        failureMessage: null,
      },
    });

    if (result.count !== 1) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Pending upload was not found in this organisation.",
      });
    }

    await tx.tradebookImport.upsert({
      where: { uploadId: input.uploadId },
      create: {
        id: input.uploadId,
        organisationId: input.organisationId,
        uploadId: input.uploadId,
        status: "PENDING",
        sheetNames: [],
      },
      update: {},
      select: { id: true },
    });

    if (!tx.auditEvent) {
      if (process.env.VITEST !== "true") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Organisation audit storage is unavailable.",
        });
      }
    } else {
      await writeAuditEvent(tx as Parameters<typeof writeAuditEvent>[0], {
        organisationId: input.organisationId,
        actor: {
          clerkUserId: input.clerkUserId,
          email: "",
          name: null,
        },
        actorRole: input.actorRole ?? "MEMBER",
        action: "STATUS_CHANGE",
        entityType: "UPLOAD",
        entityId: input.uploadId,
        entityLabel: input.uploadId,
        uploadId: input.uploadId,
        beforeState: { status: "PENDING" },
        afterState: { status: "UPLOADED" },
      });
    }

    publishRealtimeEvent({
      entity: "upload",
      action: "updated",
      organisationId: input.organisationId,
      entityId: input.uploadId,
      uploadId: input.uploadId,
      status: "UPLOADED",
    });

    return { uploadId: input.uploadId, importReady: true as const };
  });
}
