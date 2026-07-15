import { describe, expect, it, vi } from "vitest";

import {
  authorizeTradebookUpload,
  completeTradebookUpload,
} from "@/lib/tradebook/upload-lifecycle";
import { getPrivateWorkbookUrl, getWorkbookReadUrl } from "@/lib/tradebook/uploadthing";
import { getWorkbookUploadAcl } from "@/lib/tradebook/uploadthing-config";

describe("private tradebook upload lifecycle", () => {
  it("generates a short-lived URL instead of exposing a public object", async () => {
    const generateSignedURL = vi.fn().mockResolvedValue({
      ufsUrl: "https://signed.example/private-key",
    });

    await expect(
      getPrivateWorkbookUrl("private-key", { generateSignedURL }),
    ).resolves.toBe("https://signed.example/private-key");
    expect(generateSignedURL).toHaveBeenCalledWith("private-key", {
      expiresIn: "5 minutes",
    });
  });

  it("reads public workbooks from the stored blob URL", async () => {
    const previous = process.env.UPLOADTHING_WORKBOOK_ACL;
    process.env.UPLOADTHING_WORKBOOK_ACL = "public-read";

    try {
      await expect(
        getWorkbookReadUrl({
          storageKey: "public-key",
          blobUrl: "https://utfs.io/f/public-key",
        }),
      ).resolves.toBe("https://utfs.io/f/public-key");
    } finally {
      process.env.UPLOADTHING_WORKBOOK_ACL = previous;
    }
  });

  it("defaults workbook uploads to private ACL", () => {
    const previous = process.env.UPLOADTHING_WORKBOOK_ACL;
    delete process.env.UPLOADTHING_WORKBOOK_ACL;

    try {
      expect(getWorkbookUploadAcl()).toBe("private");
    } finally {
      process.env.UPLOADTHING_WORKBOOK_ACL = previous;
    }
  });

  it("authorizes only the pending record created by the current member", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "upload_1" });
    const db = {
      organisationUser: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      upload: { findFirst },
    };

    await expect(
      authorizeTradebookUpload(db, {
        organisationId: "org_1",
        uploadId: "upload_1",
        clerkUserId: "member_1",
      }),
    ).resolves.toEqual({
      organisationId: "org_1",
      uploadId: "upload_1",
      clerkUserId: "member_1",
      actorRole: "MEMBER",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "upload_1",
        organisationId: "org_1",
        uploadedByClerkUserId: "member_1",
        sourceType: "EXCEL",
        status: "PENDING",
      },
      select: { id: true },
    });
  });

  it("atomically links the private object and initializes its import", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsert = vi.fn().mockResolvedValue({ id: "import_1" });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const tx = {
      upload: { updateMany },
      tradebookImport: { upsert },
      auditEvent: { create: auditCreate },
    };
    const db = {
      ...tx,
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    await expect(
      completeTradebookUpload(db, {
        organisationId: "org_1",
        uploadId: "upload_1",
        clerkUserId: "member_1",
        actorRole: "MEMBER",
        storageKey: "private-key",
        privateUrl: "https://utfs.io/f/private-key",
      }),
    ).resolves.toEqual({ uploadId: "upload_1", importReady: true });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "upload_1",
        organisationId: "org_1",
        uploadedByClerkUserId: "member_1",
        status: "PENDING",
      },
      data: {
        status: "UPLOADED",
        storageKey: "private-key",
        blobUrl: "https://utfs.io/f/private-key",
        uploadedAt: expect.any(Date),
        failedAt: null,
        failureMessage: null,
      },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { uploadId: "upload_1" },
      create: {
        id: "upload_1",
        organisationId: "org_1",
        uploadId: "upload_1",
        status: "PENDING",
        sheetNames: [],
      },
      update: {},
      select: { id: true },
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "STATUS_CHANGE",
          entityType: "UPLOAD",
          entityId: "upload_1",
          beforeState: { status: "PENDING" },
          afterState: { status: "UPLOADED" },
        }),
      }),
    );
  });

  it("rejects a callback that no longer owns a pending record", async () => {
    const tx = {
      upload: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      tradebookImport: { upsert: vi.fn() },
      auditEvent: { create: vi.fn() },
    };
    const db = {
      ...tx,
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    await expect(
      completeTradebookUpload(db, {
        organisationId: "org_other",
        uploadId: "upload_1",
        clerkUserId: "member_1",
        storageKey: "private-key",
        privateUrl: "https://utfs.io/f/private-key",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(tx.tradebookImport.upsert).not.toHaveBeenCalled();
  });
});
