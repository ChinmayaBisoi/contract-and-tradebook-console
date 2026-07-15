import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("tradebook import pages", () => {
  it.each([
    [
      "history",
      "app/(protected)/org/[orgId]/imports/page.tsx",
      "tradebookImport.list",
      "OrganisationImports",
    ],
    [
      "review",
      "app/(protected)/org/[orgId]/imports/[importId]/page.tsx",
      "tradebookImport.get",
      "TradebookReviewWorkspace",
    ],
  ])("prefetches and suspends the %s fetching component", (_, file, query, component) => {
    const source = read(file);
    expect(source).toContain("prefetchQuery");
    expect(source).toContain(query);
    expect(source).toContain("<HydrateClient>");
    expect(source).toContain("<OperationsErrorBoundary>");
    expect(source).toMatch(/<Suspense\s+fallback=/);
    expect(source).toContain(`<${component}`);
  });

  it("fetches directly inside both Suspense-wrapped components", () => {
    expect(read("components/imports/organisation-imports.tsx")).toContain(
      "useSuspenseQuery",
    );
    expect(read("components/imports/tradebook-review-workspace.tsx")).toContain(
      "useSuspenseQuery",
    );
  });

  it("creates the database record before the private client upload", () => {
    const source = read("components/imports/tradebook-upload.tsx");
    expect(source).toMatch(/createUpload\.mutateAsync[\s\S]*await startUpload/);
    expect(source).toContain('useUploadThing("tradebookWorkbook"');
    expect(source).toContain("markUploadFailed");
    expect(source).toContain("prepare.mutateAsync");
  });

  it("provides a virtualized, editable, discardable review and commit flow", () => {
    const source = read("components/imports/tradebook-review-workspace.tsx");
    expect(source).toContain("useVirtualizer");
    expect(source).toContain("previewSheet");
    expect(source).toContain("suggestMapping");
    expect(source).toContain("Manual column mapping");
    expect(source).toContain("data.review.patches");
    expect(source).toContain("sourceOrganisations.length === 1");
    expect(source).toContain("saveReview");
    expect(source).toContain("discardedContractRows");
    expect(source).toContain("discardedLineItemRows");
    expect(source).toContain("validationErrors");
    expect(source).toContain("commit.mutateAsync");
    expect(source).toContain("Sheet preview");
  });
});
