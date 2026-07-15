import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "../app/api/uploadthing/core.ts"),
  "utf8",
);

describe("tradebook UploadThing route", () => {
  it("uses a single private 32 MB workbook endpoint", () => {
    expect(source).toContain("tradebookWorkbook");
    expect(source).toContain('maxFileSize: "32MB"');
    expect(source).toContain("maxFileCount: 1");
    expect(source).toContain('acl: "private"');
    expect(source).toContain('endsWith(".xlsx")');
  });

  it("authorizes the database record and returns callback readiness", () => {
    expect(source).toContain("authorizeTradebookUpload");
    expect(source).toContain("completeTradebookUpload");
    expect(source).toContain("storageKey: file.key");
    expect(source).toContain("privateUrl: file.ufsUrl");
  });
});
