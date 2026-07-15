import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(
    __dirname,
    "../app/api/org/[orgId]/imports/[importId]/workbook/route.ts",
  ),
  "utf8",
);

describe("tradebook workbook export route", () => {
  it("redirects legacy workbook downloads to the DB-backed organisation export", () => {
    expect(source).toContain("export async function GET");
    expect(source).toContain("Response.redirect");
    expect(source).toContain(`/api/org/\${params.orgId}/export?format=excel`);
    expect(source).not.toContain("buildReviewedWorkbook");
    expect(source).not.toContain("getWorkbookReadUrl");
    expect(source).not.toContain("record.upload.storageKey");
  });
});
