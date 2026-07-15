import { auth } from "@clerk/nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getOrCreateRequestId } from "@/lib/request-id";
import {
  authorizeTradebookUpload,
  completeTradebookUpload,
} from "@/lib/tradebook/upload-lifecycle";
import { getWorkbookUploadAcl } from "@/lib/tradebook/uploadthing-config";

const upload = createUploadthing();

export const uploadRouter = {
  tradebookWorkbook: upload(
    {
      blob: {
        maxFileSize: "32MB",
        maxFileCount: 1,
        acl: getWorkbookUploadAcl(),
      },
    },
    { awaitServerData: true },
  )
    .input(
      z.object({
        organisationId: z.string().min(1),
        uploadId: z.string().min(1),
      }),
    )
    .middleware(async ({ input, files }) => {
      const startedAt = Date.now();
      const requestId = getOrCreateRequestId(new Headers());
      const [file] = files;
      if (
        files.length !== 1 ||
        !file ||
        !file.name.toLowerCase().endsWith(".xlsx") ||
        file.type !==
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        throw new UploadThingError({
          code: "BAD_REQUEST",
          message: "Select one valid .xlsx workbook.",
        });
      }

      const session = await auth();
      if (!session.userId) {
        throw new UploadThingError("Unauthorized");
      }

      logger.debug("upload.request.start", {
        requestId,
        organisationId: input.organisationId,
        uploadId: input.uploadId,
        userId: session.userId,
        fileName: file.name,
        fileSize: file.size,
      });

      try {
        const metadata = await authorizeTradebookUpload(prisma, {
          organisationId: input.organisationId,
          uploadId: input.uploadId,
          clerkUserId: session.userId,
        });

        return {
          ...metadata,
          requestId,
          startedAt,
        };
      } catch (error) {
        logger.warn("upload.request.rejected", {
          requestId,
          organisationId: input.organisationId,
          uploadId: input.uploadId,
          userId: session.userId,
          error,
        });
        throw new UploadThingError({
          code: "FORBIDDEN",
          message:
            error instanceof Error
              ? error.message
              : "This upload is not available.",
          cause: error,
        });
      }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const { requestId, startedAt, ...uploadMetadata } = metadata;

      logger.debug("upload.request.complete", {
        requestId,
        organisationId: uploadMetadata.organisationId,
        uploadId: uploadMetadata.uploadId,
        userId: uploadMetadata.clerkUserId,
        storageKey: file.key,
        durationMs: Date.now() - startedAt,
      });

      return completeTradebookUpload(prisma, {
        ...uploadMetadata,
        storageKey: file.key,
        privateUrl: file.ufsUrl,
      });
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
