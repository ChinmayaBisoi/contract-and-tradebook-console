import { auth } from "@clerk/nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  authorizeTradebookUpload,
  completeTradebookUpload,
} from "@/lib/tradebook/upload-lifecycle";

const upload = createUploadthing();

export const uploadRouter = {
  tradebookWorkbook: upload(
    {
      blob: {
        maxFileSize: "32MB",
        maxFileCount: 1,
        acl: "private",
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

      try {
        return await authorizeTradebookUpload(prisma, {
          organisationId: input.organisationId,
          uploadId: input.uploadId,
          clerkUserId: session.userId,
        });
      } catch (error) {
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
    .onUploadComplete(async ({ metadata, file }) =>
      completeTradebookUpload(prisma, {
        ...metadata,
        storageKey: file.key,
        privateUrl: file.ufsUrl,
      }),
    ),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
