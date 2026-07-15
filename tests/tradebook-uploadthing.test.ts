import { describe, expect, it, vi } from "vitest";

import {
  authorizeTradebookUpload,
  completeTradebookUpload,
} from "@/lib/tradebook/upload-lifecycle";
import { getPrivateWorkbookUrl } from "@/lib/tradebook/uploadthing";

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
    const tx = { upload: { updateMany }, tradebookImport: { upsert } };
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
        organisationId: "org_1",
        uploadId: "upload_1",
        status: "PENDING",
        sheetNames: [],
      },
      update: {},
      select: { id: true },
    });
  });

  it("rejects a callback that no longer owns a pending record", async () => {
    const tx = {
      upload: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      tradebookImport: { upsert: vi.fn() },
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
