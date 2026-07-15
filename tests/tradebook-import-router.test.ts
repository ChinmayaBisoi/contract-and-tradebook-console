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
    const api = caller({
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      upload: { updateMany },
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
});
