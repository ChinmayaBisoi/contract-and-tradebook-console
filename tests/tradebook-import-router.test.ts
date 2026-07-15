// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { appRouter } from "@/trpc/routers/_app";

const auth = {
  clerkUserId: "member_1",
  email: "member@example.com",
  name: "Member User",
};

function caller(db: Record<string, unknown>) {
  return appRouter.createCaller({ headers: new Headers(), auth, db });
}

describe("tradebook import upload procedures", () => {
  it("creates the organisation-scoped database record before upload", async () => {
    const create = vi.fn().mockResolvedValue({ id: "upload_1" });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const api = caller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      upload: { create },
      auditEvent: { create: auditCreate },
    });

    await expect(
      api.tradebookImport.createUpload({
        organisationId: "org_1",
        fileName: "tradebook.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSizeBytes: 203_966,
      }),
    ).resolves.toEqual({ uploadId: "upload_1" });

    expect(create).toHaveBeenCalledWith({
      data: {
        organisationId: "org_1",
        uploadedByClerkUserId: "member_1",
        sourceType: "EXCEL",
        status: "PENDING",
        fileName: "tradebook.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSizeBytes: 203_966,
      },
      select: { id: true },
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entityType: "UPLOAD",
          entityId: "upload_1",
          afterState: expect.objectContaining({ status: "PENDING" }),
        }),
      }),
    );
  });

  it("rejects non-xlsx and oversized workbook records", async () => {
    const create = vi.fn();
    const api = caller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      upload: { create },
    });

    await expect(
      api.tradebookImport.createUpload({
        organisationId: "org_1",
        fileName: "tradebook.xls",
        mimeType:
          "application/vnd.ms-excel" as "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      api.tradebookImport.createUpload({
        organisationId: "org_1",
        fileName: "tradebook.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSizeBytes: 32 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(create).not.toHaveBeenCalled();
  });

  it("marks only the current uploader's organisation record as failed", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const api = caller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      upload: { updateMany },
      auditEvent: { create: auditCreate },
    });

    await expect(
      api.tradebookImport.markUploadFailed({
        organisationId: "org_1",
        uploadId: "upload_1",
        message: "The private upload could not be completed.",
      }),
    ).resolves.toEqual({ uploadId: "upload_1" });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "upload_1",
        organisationId: "org_1",
        uploadedByClerkUserId: "member_1",
        status: { in: ["PENDING", "UPLOADED"] },
      },
      data: {
        status: "FAILED",
        failedAt: expect.any(Date),
        failureMessage: "The private upload could not be completed.",
      },
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "STATUS_CHANGE",
          entityType: "UPLOAD",
          entityId: "upload_1",
          afterState: expect.objectContaining({ status: "FAILED" }),
        }),
      }),
    );
  });

  it("does not disclose an upload outside the organisation boundary", async () => {
    const api = caller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      upload: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    });

    await expect(
      api.tradebookImport.markUploadFailed({
        organisationId: "org_1",
        uploadId: "upload_elsewhere",
        message: "Upload failed.",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists only imports from the active organisation", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const api = caller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      tradebookImport: { findMany, count },
    });

    await expect(
      api.tradebookImport.list({
        organisationId: "org_1",
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, pageCount: 0 },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organisationId: "org_1" } }),
    );
  });

  it("does not disclose an import from another organisation", async () => {
    const api = caller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      tradebookImport: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      api.tradebookImport.get({
        organisationId: "org_1",
        importId: "import_elsewhere",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns terminal counts when an imported commit is retried", async () => {
    const api = caller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      tradebookImport: {
        findFirst: vi.fn().mockResolvedValue({
          id: "import_1",
          organisationId: "org_1",
          uploadId: "upload_1",
          status: "IMPORTED",
          importedContractCount: 14,
          importedLineItemCount: 1153,
          upload: { uploadedByClerkUserId: "member_1" },
        }),
      },
    });

    await expect(
      api.tradebookImport.commit({
        organisationId: "org_1",
        importId: "import_1",
      }),
    ).resolves.toEqual({
      importId: "import_1",
      contractCount: 14,
      lineItemCount: 1153,
      discardedCount: 0,
    });
  });
});
