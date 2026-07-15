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
  it("streams xlsx workbook downloads from a dedicated route", () => {
    expect(source).toContain("export async function GET");
    expect(source).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(source).toContain("Content-Disposition");
    expect(source).toContain("buildReviewedWorkbook");
  });
});
