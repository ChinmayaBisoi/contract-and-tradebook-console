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
  ])("prefetches the %s list query", (_, file, query, component) => {
    const source = read(file);
    expect(source).toContain("prefetchQuery");
    expect(source).toContain(query);
    expect(source).toContain("<HydrateClient>");
    expect(source).toContain("<OperationsErrorBoundary>");
    expect(source).toContain(`<${component}`);
    if (file.includes("imports/page.tsx") && !file.includes("[importId]")) {
      expect(source).not.toMatch(/<Suspense\s+fallback=/);
    } else {
      expect(source).toMatch(/<Suspense\s+fallback=/);
    }
  });

  it("loads import history with keepPreviousData", () => {
    expect(read("components/imports/organisation-imports.tsx")).toContain(
      "useQuery",
    );
    expect(read("components/imports/organisation-imports.tsx")).toContain(
      "keepPreviousData",
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
    expect(source).toContain("prepareInBackground");
    expect(source).toMatch(/router\.push[\s\S]*prepareInBackground/);
    expect(source).toContain("tradebook-preflight.worker.ts");
  });

  it("provides editable review, tabular mappings, and gated preview", () => {
    const source = read("components/imports/tradebook-review-workspace.tsx");
    expect(source).toContain("Export Excel");
    expect(source).toContain("Export JSON");
    expect(source).not.toContain("Export workbook");
    expect(source).toContain(`/api/org/\${organisationId}/export?format=excel`);
    expect(source).toContain(`/api/org/\${organisationId}/export?format=json`);
    expect(source).toContain("getWorkbookData");
    expect(source).toContain("useLiveWorkbookPreview");
    expect(source).toContain("suggestMapping");
    expect(source).toContain("Import partition + Sheet mappings");
    expect(source).toContain("Validate mappings to unlock the Excel sheet preview");
    expect(source).toContain("needsAutoSuggestion");
    expect(source).toContain("data.review.patches");
    expect(source).toContain("sourceOrganisations.length === 1");
    expect(source).toContain("useOrganisationEvents");
    expect(source).toContain("saveReview");
    expect(source).toContain("discardedContractRows");
    expect(source).toContain("discardedLineItemRows");
    expect(source).toContain("validationErrors");
    expect(source).toContain("commit.mutateAsync");
    expect(source).toContain("Sheet preview");
  });

  it("owns preview rows in the browser with live recalculation", () => {
    const workspace = read("components/imports/tradebook-review-workspace.tsx");
    const router = read("trpc/routers/tradebook-import.ts");
    const hook = read("components/imports/use-live-workbook-preview.ts");
    expect(workspace).toContain("getWorkbookData");
    expect(workspace).not.toContain("previewSheet.queryOptions");
    expect(workspace).toContain("rows loaded in browser");
    expect(workspace).toContain("filterSheetRowsForOrganisation");
    expect(hook).toContain("buildClientPreviewWorkbook");
    expect(router).toContain("getWorkbookData: protectedProcedure");
    expect(router).toContain("persistEditedWorkbookArtifact");
    expect(router).toContain("editedWorkbook");
  });
});
