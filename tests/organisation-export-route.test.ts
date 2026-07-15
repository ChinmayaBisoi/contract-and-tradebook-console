import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "../app/api/org/[orgId]/export/route.ts"),
  "utf8",
);

describe("organisation export route", () => {
  it("streams a JSON export for all organisation data", () => {
    expect(source).toContain("export async function GET");
    expect(source).toContain('attachment; filename="');
    expect(source).toContain('"Content-Type": "application/json; charset=utf-8"');
    expect(source).toContain("organisationUsers");
    expect(source).toContain("tradebookImports");
    expect(source).toContain("auditEvents");
  });
});
