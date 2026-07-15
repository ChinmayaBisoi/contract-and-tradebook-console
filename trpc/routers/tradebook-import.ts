import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
  type OrganisationMembership,
} from "@/lib/organisation-access";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_WORKBOOK_BYTES = 32 * 1024 * 1024;

const organisationInput = z.object({
  organisationId: z.string().min(1),
});

const createUploadInput = organisationInput.extend({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((value) => value.toLowerCase().endsWith(".xlsx"), {
      message: "Only .xlsx workbooks can be imported.",
    }),
  mimeType: z.literal(XLSX_MIME),
  fileSizeBytes: z.number().int().positive().max(MAX_WORKBOOK_BYTES),
});

const markUploadFailedInput = organisationInput.extend({
  uploadId: z.string().min(1),
  message: z.string().trim().min(1).max(500),
});

type TradebookImportDb = {
  organisationUser: {
    findUnique: (args: unknown) => Promise<OrganisationMembership | null>;
  };
  upload: {
    create: (args: unknown) => Promise<{ id: string }>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

async function requireImportPermission(
  db: TradebookImportDb,
  clerkUserId: string,
  organisationId: string,
  action: "import:read" | "import:create",
) {
  return checkOrgPermission({
    clerkUserId,
    organisationId,
    action,
    findMembership: createOrganisationMembershipFinder(db),
  });
}

export const tradebookImportRouter = createTRPCRouter({
  createUpload: protectedProcedure
    .input(createUploadInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as TradebookImportDb;
      await requireImportPermission(
        db,
        ctx.auth.clerkUserId,
        input.organisationId,
        "import:create",
      );

      const upload = await db.upload.create({
        data: {
          organisationId: input.organisationId,
          uploadedByClerkUserId: ctx.auth.clerkUserId,
          sourceType: "EXCEL",
          status: "PENDING",
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
        },
        select: { id: true },
      });

      return { uploadId: upload.id };
    }),

  markUploadFailed: protectedProcedure
    .input(markUploadFailedInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as TradebookImportDb;
      await requireImportPermission(
        db,
        ctx.auth.clerkUserId,
        input.organisationId,
        "import:create",
      );

      const result = await db.upload.updateMany({
        where: {
          id: input.uploadId,
          organisationId: input.organisationId,
          uploadedByClerkUserId: ctx.auth.clerkUserId,
          status: { in: ["PENDING", "UPLOADED"] },
        },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureMessage: input.message,
        },
      });

      if (result.count !== 1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Upload was not found in this organisation.",
        });
      }

      return { uploadId: input.uploadId };
    }),
});
