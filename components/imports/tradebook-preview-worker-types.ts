import type {
  ClientCellPatch,
  ClientSheetMapping,
  ClientWorkbookData,
} from "@/lib/tradebook/client-preview";

export type PreviewWorkerRequest =
  | {
      type: "init";
      data: ClientWorkbookData;
    }
  | {
      type: "recalc";
      patches: ClientCellPatch[];
      mappings: ClientSheetMapping[];
      discardedContractRows: number[];
      discardedLineItemRows: number[];
      requestId: number;
    };

export type PreviewWorkerResponse =
  | { type: "complete"; requestId: number; data: ClientWorkbookData }
  | { type: "error"; requestId: number; message: string };
