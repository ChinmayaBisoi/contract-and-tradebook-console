import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("operations page Suspense structure", () => {
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
  ])("prefetches and suspends the %s fetching component", (_, file, component) => {
    const source = read(file);
    expect(source).toContain("prefetchQuery");
    expect(source).toContain("<HydrateClient>");
    expect(source).toMatch(/<Suspense\s+fallback=/);
    expect(source).toContain(`<${component}`);
  });

  it("fetches inside the components wrapped by Suspense", () => {
    expect(read("components/operations/contracts.tsx")).toContain(
      "useSuspenseQuery",
    );
    expect(read("components/operations/line-items.tsx")).toContain(
      "useSuspenseQuery",
    );
    expect(read("components/operations/audit-trail.tsx")).toContain(
      "useSuspenseQuery",
    );
  });

  it("refreshes the audit trail after successful team mutations", () => {
    const source = read("components/organisation/team/organisation-team.tsx");

    expect(source).toContain("trpc.audit.list.queryFilter({ organisationId })");
  });
});
