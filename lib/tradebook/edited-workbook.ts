import { UTApi } from "uploadthing/server";

import { buildReviewedWorkbook, buildTradebookExportFileName } from "@/lib/tradebook/export";
import type { EditedWorkbookArtifact } from "@/lib/tradebook/mapping";
import type { ParsedWorkbook, SnapshotValue } from "@/lib/tradebook/parser";
import { getWorkbookReadUrl } from "@/lib/tradebook/uploadthing";
import type { CellPatch } from "@/lib/tradebook/validation";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type UploadFileResult = {
  data?: {
    key: string;
    ufsUrl?: string;
    url?: string;
  } | null;
  error?: unknown;
};

type EditedWorkbookUploader = {
  uploadFiles: (files: File[]) => Promise<UploadFileResult[]>;
};

function clearDiscardedRowsInBuffer(
  parsed: ParsedWorkbook,
  discardedContractRows: number[],
  discardedLineItemRows: number[],
  sheetNamesByRole: {
    summary?: string;
    lineItems?: string;
  },
  patches: CellPatch[],
) {
  const discardPatches: CellPatch[] = [...patches];
  const addClears = (sheetName: string | undefined, rows: number[]) => {
    if (!sheetName) return;
    const sheet = parsed.workbookSnapshot.sheets.find(
      (entry) => entry.name === sheetName,
    );
    if (!sheet) return;
    for (const row of rows) {
      for (let column = 1; column <= sheet.columnCount; column += 1) {
        discardPatches.push({
          sheet: sheetName,
          row,
          column,
          value: null,
        });
      }
    }
  };
  addClears(sheetNamesByRole.summary, discardedContractRows);
  addClears(sheetNamesByRole.lineItems, discardedLineItemRows);
  return discardPatches;
}

export async function persistEditedWorkbookArtifact({
  storageKey,
  blobUrl,
  fileName,
  parsed,
  patches,
  discardedContractRows,
  discardedLineItemRows,
  sheetNamesByRole,
  uploader = new UTApi() as unknown as EditedWorkbookUploader,
}: {
  storageKey: string;
  blobUrl: string | null;
  fileName: string | null;
  parsed: ParsedWorkbook;
  patches: CellPatch[];
  discardedContractRows: number[];
  discardedLineItemRows: number[];
  sheetNamesByRole: { summary?: string; lineItems?: string };
  uploader?: EditedWorkbookUploader;
}): Promise<EditedWorkbookArtifact | null> {
  try {
    const url = await getWorkbookReadUrl({ storageKey, blobUrl });
    const response = await fetch(url);
    if (!response.ok) return null;
    const sourceBuffer = Buffer.from(await response.arrayBuffer());
    const effectivePatches = clearDiscardedRowsInBuffer(
      parsed,
      discardedContractRows,
      discardedLineItemRows,
      sheetNamesByRole,
      patches,
    );
    const editedBuffer = await buildReviewedWorkbook({
      sourceBuffer,
      parsed,
      patches: effectivePatches,
    });
    const outputName = buildTradebookExportFileName(fileName);
    const file = new File([new Uint8Array(editedBuffer)], outputName, {
      type: XLSX_MIME,
    });
    const uploaded = await uploader.uploadFiles([file]);
    const first = uploaded[0];
    if (!first?.data?.key) return null;
    return {
      storageKey: first.data.key,
      blobUrl: first.data.ufsUrl ?? first.data.url ?? null,
      fileName: outputName,
      savedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function applyPatchesToSnapshot(
  parsed: ParsedWorkbook,
  patches: Array<{
    sheet: string;
    row: number;
    column: number;
    value: SnapshotValue;
  }>,
): ParsedWorkbook["workbookSnapshot"] {
  const sheets = parsed.workbookSnapshot.sheets.map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row) => [...row]),
  }));
  const byName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  for (const patch of patches) {
    const sheet = byName.get(patch.sheet);
    const row = sheet?.rows[patch.row - 1];
    if (row && patch.column > 0) {
      row[patch.column - 1] = patch.value;
    }
  }
  return { sheets };
}
