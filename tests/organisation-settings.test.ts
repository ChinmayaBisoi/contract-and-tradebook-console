import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("organisation settings UI", () => {
  it("prefetches organisation details for the settings page", () => {
    const page = read("app/(protected)/org/[orgId]/settings/page.tsx");

    expect(page).toContain("prefetchQuery");
    expect(page).toContain("OrganisationSettings");
    expect(page).toContain("trpc.organisation.get.queryOptions");
  });

  it("limits organisation edits to owners in the settings form", () => {
    const settings = read("components/organisation/organisation-settings.tsx");

    expect(settings).toContain('organisation.role === "OWNER"');
    expect(settings).toContain("trpc.organisation.update");
    expect(settings).toContain("Owner access required");
    expect(settings).toContain("readOnly={!isOwner}");
  });
});
