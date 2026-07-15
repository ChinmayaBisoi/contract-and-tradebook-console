import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("realtime UI subscriptions", () => {
  it("uses the user-scoped event hook on the dashboard", () => {
    expect(read("components/dashboard/organisation-dashboard.tsx")).toContain(
      "useUserEvents",
    );
  });

  it("uses the organisation-scoped event hook across org surfaces", () => {
    expect(read("components/organisation/team/organisation-team.tsx")).toContain(
      "useOrganisationEvents",
    );
    expect(read("components/operations/contracts.tsx")).toContain(
      "useOrganisationEvents",
    );
    expect(read("components/operations/line-items.tsx")).toContain(
      "useOrganisationEvents",
    );
    expect(read("components/contracts/contract-detail.tsx")).toContain(
      "useOrganisationEvents",
    );
    expect(read("components/imports/organisation-imports.tsx")).toContain(
      "useOrganisationEvents",
    );
    expect(read("components/imports/tradebook-review-workspace.tsx")).toContain(
      "useOrganisationEvents",
    );
  });
});
