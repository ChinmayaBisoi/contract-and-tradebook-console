import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "../trpc/routers/tradebook-import.ts"),
  "utf8",
);

describe("tradebook import API surface", () => {
  it.each([
    "createUpload",
    "markUploadFailed",
    "prepare",
    "list",
    "get",
    "getWorkbookData",
    "previewSheet",
    "suggestMapping",
    "saveReview",
    "commit",
  ])("exposes %s", (procedure) => {
    expect(source).toContain(`${procedure}: protectedProcedure`);
  });

  it("stores sparse review edits rather than accepting workbook matrices", () => {
    expect(source).toContain("patches: z.array(patchSchema)");
    expect(source).toContain("discardedContractRows");
    expect(source).toContain("discardedLineItemRows");
    expect(source).not.toContain("workbookSnapshot: z.");
  });

  it("returns saved sparse review state so review sessions can resume", () => {
    expect(source).toContain("review: reviewState(record)");
  });

  it("persists an edited workbook artifact on save", () => {
    expect(source).toContain("persistEditedWorkbookArtifact");
    expect(source).toContain("editedWorkbook");
  });

  it("does not expose a source-workbook export path", () => {
    expect(source).not.toContain("exportPath");
  });
});
