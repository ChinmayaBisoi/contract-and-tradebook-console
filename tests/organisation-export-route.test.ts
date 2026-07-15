import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "../app/api/org/[orgId]/export/route.ts"),
  "utf8",
);
const dockerfile = readFileSync(
  path.resolve(__dirname, "../Dockerfile"),
  "utf8",
);

describe("organisation export route", () => {
  it("supports both excel and json organisation exports", () => {
    expect(source).toContain("export async function GET");
    expect(source).toContain('searchParams.get("format")');
    expect(source).toContain("application/json; charset=utf-8");
    expect(source).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(source).toContain(
      '"Content-Type": "application/json; charset=utf-8"',
    );
    expect(source).toContain('"Content-Type": XLSX_MIME');
    expect(source).toContain("buildOrganisationWorkbook");
    expect(source).toContain("buildOrganisationContractsJson");
  });

  it("copies the workbook template into the production image", () => {
    expect(dockerfile).toContain(
      "COPY --from=builder /app/sample_tradebook_xl.xlsx ./sample_tradebook_xl.xlsx",
    );
  });
});
