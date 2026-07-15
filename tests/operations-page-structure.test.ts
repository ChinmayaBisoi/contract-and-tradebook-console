import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("operations page query structure", () => {
  it.each([
    [
      "contracts",
      "app/(protected)/org/[orgId]/contracts/page.tsx",
      "OrganisationContracts",
    ],
    [
      "line items",
      "app/(protected)/org/[orgId]/line-items/page.tsx",
      "OrganisationLineItems",
    ],
    [
      "contract line items",
      "app/(protected)/org/[orgId]/contracts/[contractId]/line-items/page.tsx",
      "OrganisationLineItems",
    ],
    [
      "audit trail",
      "app/(protected)/org/[orgId]/audit-trail/page.tsx",
      "OrganisationAuditTrail",
    ],
  ])("prefetches the %s list query", (_, file, component) => {
    const source = read(file);
    expect(source).toContain("prefetchQuery");
    expect(source).toContain("<HydrateClient>");
    expect(source).toContain(`<${component}`);
    expect(source).not.toMatch(/<Suspense\s+fallback=/);
  });

  it("loads operations tables with keepPreviousData", () => {
    for (const file of [
      "components/operations/contracts.tsx",
      "components/operations/line-items.tsx",
      "components/operations/audit-trail.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("useQuery");
      expect(source).toContain("keepPreviousData");
      expect(source).toContain("DebouncedInput");
    }
  });

  it("refreshes the audit trail after successful team mutations", () => {
    const source = read("components/organisation/team/organisation-team.tsx");

    expect(source).toContain("trpc.audit.list.queryFilter({ organisationId })");
  });
});
