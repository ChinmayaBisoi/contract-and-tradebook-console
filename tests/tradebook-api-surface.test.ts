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

  it("returns export metadata for reviewed workbook downloads", () => {
    expect(source).toContain("exportPath");
  });
});
