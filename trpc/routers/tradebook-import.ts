import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  checkOrgPermission,
  createOrganisationMembershipFinder,
  type OrganisationMembership,
} from "@/lib/organisation-access";
import {
  analyzeWorkbookMapping,
  buildAiMappingRequest,
  suggestMappingsWithAi,
  type WorkbookMappingAnalysis,
} from "@/lib/tradebook/mapping";
import {
  type ParsedWorkbook,
  parseWorkbookBuffer,
} from "@/lib/tradebook/parser";
import { persistReviewedDraft } from "@/lib/tradebook/persistence";
import { getWorkbookReadUrl } from "@/lib/tradebook/uploadthing";
import { buildImportDraft, type CellPatch } from "@/lib/tradebook/validation";
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

const importInput = organisationInput.extend({
  importId: z.string().min(1),
});

const patchSchema = z.object({
  sheet: z.string().min(1),
  row: z.number().int().positive(),
  column: z.number().int().positive(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const sheetMappingSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["ORGANIZATIONS", "LINE_ITEMS", "SUMMARY", "OTHER"]),
  headerRow: z.number().int().positive().nullable(),
  mapping: z.record(z.string(), z.number().int().nonnegative()),
});

type ImportRecord = {
  id: string;
  organisationId: string;
  uploadId: string;
  status: "PENDING" | "MAPPED" | "IMPORTED" | "FAILED";
  sheetNames: unknown;
  workbookSnapshot: unknown;
  formulaSnapshot: unknown;
  mappingConfig: unknown;
  validationErrors: unknown;
  selectedSourceOrganisationId: string | null;
  reviewPatches: unknown;
  discardedRows: unknown;
  importedContractCount: number;
  importedLineItemCount: number;
  preparedAt: Date | null;
  importedAt: Date | null;
  failedAt: Date | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  upload: {
    id: string;
    uploadedByClerkUserId: string;
    status: "PENDING" | "UPLOADED" | "PROCESSING" | "PROCESSED" | "FAILED";
    storageKey: string | null;
    blobUrl: string | null;
    fileName: string | null;
    fileSizeBytes: number | null;
  };
};

type TradebookImportDb = {
  organisationUser: {
    findUnique: (args: unknown) => Promise<OrganisationMembership | null>;
  };
  upload: {
    create: (args: unknown) => Promise<{ id: string }>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  tradebookImport: {
    findFirst: (args: unknown) => Promise<ImportRecord | null>;
    findMany: (args: unknown) => Promise<ImportRecord[]>;
    count: (args: unknown) => Promise<number>;
    update: (args: unknown) => Promise<ImportRecord>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  contract: {
    findMany: (args: unknown) => Promise<Array<{ poRefNo: string }>>;
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

function requireImport(record: ImportRecord | null) {
  if (!record) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Tradebook import was not found in this organisation.",
    });
  }
  return record;
}

function parsedWorkbook(record: ImportRecord): ParsedWorkbook {
  if (!record.workbookSnapshot || !record.formulaSnapshot) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Prepare the workbook before reviewing it.",
    });
  }
  return {
    workbookSnapshot:
      record.workbookSnapshot as ParsedWorkbook["workbookSnapshot"],
    formulaSnapshot:
      record.formulaSnapshot as ParsedWorkbook["formulaSnapshot"],
  };
}

function mappingAnalysis(record: ImportRecord) {
  if (!record.mappingConfig) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Confirm workbook mappings before reviewing rows.",
    });
  }
  return record.mappingConfig as WorkbookMappingAnalysis;
}

function reviewState(record: ImportRecord) {
  const discarded = (record.discardedRows ?? {}) as {
    contractRows?: number[];
    lineItemRows?: number[];
  };
  return {
    patches: (record.reviewPatches ?? []) as CellPatch[],
    discardedContractRows: discarded.contractRows ?? [],
    discardedLineItemRows: discarded.lineItemRows ?? [],
  };
}

async function ownedImport(
  db: TradebookImportDb,
  input: { organisationId: string; importId: string },
  clerkUserId?: string,
) {
  return requireImport(
    await db.tradebookImport.findFirst({
      where: {
        id: input.importId,
        organisationId: input.organisationId,
        ...(clerkUserId
          ? { upload: { uploadedByClerkUserId: clerkUserId } }
          : {}),
      },
      include: { upload: true },
    }),
  );
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

  prepare: protectedProcedure
    .input(importInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as TradebookImportDb;
      await requireImportPermission(
        db,
        ctx.auth.clerkUserId,
        input.organisationId,
        "import:create",
      );
      const record = await ownedImport(db, input, ctx.auth.clerkUserId);
      if (!record.upload.storageKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The private workbook upload has not completed.",
        });
      }

      const claimed = await db.upload.updateMany({
        where: {
          id: record.uploadId,
          organisationId: input.organisationId,
          status: "UPLOADED",
        },
        data: {
          status: "PROCESSING",
          processingStartedAt: new Date(),
          failureMessage: null,
        },
      });
      if (claimed.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This workbook is already being prepared.",
        });
      }

      try {
        const url = await getWorkbookReadUrl({
          storageKey: record.upload.storageKey,
          blobUrl: record.upload.blobUrl,
        });
        const response = await fetch(url);
        if (!response.ok)
          throw new Error("Private workbook could not be read.");
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_WORKBOOK_BYTES) {
          throw new Error("Workbook exceeds the 32 MB limit.");
        }
        const parsed = await parseWorkbookBuffer(buffer);
        const mapping = analyzeWorkbookMapping(parsed.workbookSnapshot);
        const preparedAt = new Date();

        await db.tradebookImport.update({
          where: { id: record.id },
          data: {
            sheetNames: parsed.workbookSnapshot.sheets.map(
              (sheet) => sheet.name,
            ),
            workbookSnapshot: parsed.workbookSnapshot,
            formulaSnapshot: parsed.formulaSnapshot,
            mappingConfig: mapping,
            validationErrors: [],
            preparedAt,
            failedAt: null,
            failureMessage: null,
          },
        });
        await db.upload.updateMany({
          where: { id: record.uploadId, organisationId: input.organisationId },
          data: { status: "PROCESSED", processedAt: preparedAt },
        });

        return {
          importId: record.id,
          sheets: mapping.sheets,
          sourceOrganisations: mapping.sourceOrganisations,
          formulaCount: parsed.formulaSnapshot.cells.length,
          validationTotal: 0,
          requiresAssistance: mapping.requiresAssistance,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Workbook preparation failed.";
        await Promise.all([
          db.tradebookImport.updateMany({
            where: { id: record.id, organisationId: input.organisationId },
            data: {
              status: "FAILED",
              failedAt: new Date(),
              failureMessage: message,
            },
          }),
          db.upload.updateMany({
            where: {
              id: record.uploadId,
              organisationId: input.organisationId,
            },
            data: {
              status: "FAILED",
              failedAt: new Date(),
              failureMessage: message,
            },
          }),
        ]);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The workbook could not be prepared for review.",
          cause: error,
        });
      }
    }),

  list: protectedProcedure
    .input(
      organisationInput.extend({
        page: z.number().int().positive().default(1),
        pageSize: z
          .union([z.literal(10), z.literal(20), z.literal(50)])
          .default(10),
        status: z.enum(["PENDING", "MAPPED", "IMPORTED", "FAILED"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as unknown as TradebookImportDb;
      await requireImportPermission(
        db,
        ctx.auth.clerkUserId,
        input.organisationId,
        "import:read",
      );
      const where = {
        organisationId: input.organisationId,
        ...(input.status ? { status: input.status } : {}),
      };
      const [rows, total] = await Promise.all([
        db.tradebookImport.findMany({
          where,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          orderBy: { updatedAt: "desc" },
          include: { upload: true },
        }),
        db.tradebookImport.count({ where }),
      ]);
      return {
        data: rows.map((row) => ({
          id: row.id,
          status: row.status,
          fileName: row.upload.fileName,
          fileSizeBytes: row.upload.fileSizeBytes,
          sourceOrganisationId: row.selectedSourceOrganisationId,
          contractCount: row.importedContractCount,
          lineItemCount: row.importedLineItemCount,
          failureMessage: row.failureMessage,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total,
          pageCount: Math.ceil(total / input.pageSize),
        },
        facets: {
          statuses: ["PENDING", "MAPPED", "IMPORTED", "FAILED"] as const,
        },
      };
    }),

  get: protectedProcedure.input(importInput).query(async ({ ctx, input }) => {
    const db = ctx.db as unknown as TradebookImportDb;
    await requireImportPermission(
      db,
      ctx.auth.clerkUserId,
      input.organisationId,
      "import:read",
    );
    const record = await ownedImport(db, input);
    return {
      id: record.id,
      status: record.status,
      fileName: record.upload.fileName,
      fileSizeBytes: record.upload.fileSizeBytes,
      sheetNames: record.sheetNames,
      mapping: record.mappingConfig,
      validationErrors: record.validationErrors,
      selectedSourceOrganisationId: record.selectedSourceOrganisationId,
      formulaCount:
        (record.formulaSnapshot as ParsedWorkbook["formulaSnapshot"] | null)
          ?.cells.length ?? 0,
      importedContractCount: record.importedContractCount,
      importedLineItemCount: record.importedLineItemCount,
      failureMessage: record.failureMessage,
      review: reviewState(record),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }),

  previewSheet: protectedProcedure
    .input(
      importInput.extend({
        sheetName: z.string().min(1),
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as unknown as TradebookImportDb;
      await requireImportPermission(
        db,
        ctx.auth.clerkUserId,
        input.organisationId,
        "import:read",
      );
      const record = await ownedImport(db, input);
      const parsed = parsedWorkbook(record);
      const sheet = parsed.workbookSnapshot.sheets.find(
        (entry) => entry.name === input.sheetName,
      );
      if (!sheet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sheet was not found.",
        });
      }
      const rows = sheet.rows.map((row) => [...row]);
      for (const patch of reviewState(record).patches) {
        const row = rows[patch.row - 1];
        if (patch.sheet === sheet.name && row) {
          row[patch.column - 1] = patch.value;
        }
      }
      return {
        sheet: {
          name: sheet.name,
          rowCount: sheet.rowCount,
          columnCount: sheet.columnCount,
          footerRows: sheet.footerRows,
        },
        rows: rows
          .slice(input.offset, input.offset + input.limit)
          .map((row, index) => ({
            rowNumber: input.offset + index + 1,
            values: row,
          })),
        nextOffset:
          input.offset + input.limit < rows.length
            ? input.offset + input.limit
            : null,
      };
    }),

  suggestMapping: protectedProcedure
    .input(importInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as TradebookImportDb;
      await requireImportPermission(
        db,
        ctx.auth.clerkUserId,
        input.organisationId,
        "import:create",
      );
      const record = await ownedImport(db, input, ctx.auth.clerkUserId);
      const parsed = parsedWorkbook(record);
      const mapping = mappingAnalysis(record);
      return suggestMappingsWithAi({
        apiKey: process.env.OPENAI_API_KEY,
        request: buildAiMappingRequest(parsed.workbookSnapshot, mapping),
      });
    }),

  saveReview: protectedProcedure
    .input(
      importInput.extend({
        selectedSourceOrganisationId: z.string().min(1),
        sheets: z.array(sheetMappingSchema),
        patches: z.array(patchSchema).max(10_000).default([]),
        discardedContractRows: z.array(z.number().int().positive()).default([]),
        discardedLineItemRows: z.array(z.number().int().positive()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as TradebookImportDb;
      await requireImportPermission(
        db,
        ctx.auth.clerkUserId,
        input.organisationId,
        "import:create",
      );
      const record = await ownedImport(db, input, ctx.auth.clerkUserId);
      if (record.status === "IMPORTED") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Import is already complete.",
        });
      }
      const parsed = parsedWorkbook(record);
      const detected = mappingAnalysis(record);
      const confirmed: WorkbookMappingAnalysis = {
        ...detected,
        sheets: input.sheets.map((sheet) => ({
          ...sheet,
          headers:
            detected.sheets.find((entry) => entry.name === sheet.name)
              ?.headers ?? [],
          missingRequired: [],
        })),
        requiresAssistance: false,
      };
      if (
        !confirmed.sourceOrganisations.some(
          (source) => source.id === input.selectedSourceOrganisationId,
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select an organisation found in this workbook.",
        });
      }
      const existing = await db.contract.findMany({
        where: { organisationId: input.organisationId },
        select: { poRefNo: true },
      });
      const draft = buildImportDraft({
        parsed,
        mapping: confirmed,
        selectedSourceOrganisationId: input.selectedSourceOrganisationId,
        patches: input.patches,
        discardedContractRows: input.discardedContractRows,
        discardedLineItemRows: input.discardedLineItemRows,
        existingPoRefs: new Set(existing.map((contract) => contract.poRefNo)),
      });
      await db.tradebookImport.update({
        where: { id: record.id },
        data: {
          selectedSourceOrganisationId: input.selectedSourceOrganisationId,
          mappingConfig: confirmed,
          reviewPatches: input.patches,
          discardedRows: {
            contractRows: input.discardedContractRows,
            lineItemRows: input.discardedLineItemRows,
          },
          validationErrors: draft.errors,
          status: draft.errors.length === 0 ? "MAPPED" : "PENDING",
        },
      });
      return {
        contractCount: draft.contracts.length,
        lineItemCount: draft.lineItems.length,
        discardedCount: draft.discardedCount,
        validationErrors: draft.errors,
        readyToImport: draft.errors.length === 0,
      };
    }),

  commit: protectedProcedure
    .input(importInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as unknown as TradebookImportDb;
      const membership = await requireImportPermission(
        db,
        ctx.auth.clerkUserId,
        input.organisationId,
        "import:create",
      );
      const record = await ownedImport(db, input, ctx.auth.clerkUserId);
      if (record.status === "IMPORTED") {
        return {
          importId: record.id,
          contractCount: record.importedContractCount,
          lineItemCount: record.importedLineItemCount,
          discardedCount: 0,
        };
      }
      if (record.status !== "MAPPED" || !record.selectedSourceOrganisationId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Resolve validation errors before importing.",
        });
      }
      const existing = await db.contract.findMany({
        where: { organisationId: input.organisationId },
        select: { poRefNo: true },
      });
      const draft = buildImportDraft({
        parsed: parsedWorkbook(record),
        mapping: mappingAnalysis(record),
        selectedSourceOrganisationId: record.selectedSourceOrganisationId,
        existingPoRefs: new Set(existing.map((contract) => contract.poRefNo)),
        ...reviewState(record),
      });
      return persistReviewedDraft({
        organisationId: input.organisationId,
        importId: record.id,
        uploadId: record.uploadId,
        actor: ctx.auth,
        actorRole: membership.role,
        draft,
      });
    }),
});
