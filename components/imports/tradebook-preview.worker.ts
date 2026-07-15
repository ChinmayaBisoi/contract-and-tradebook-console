import {
  buildClientPreviewWorkbook,
  type ClientCellPatch,
  type ClientSheetMapping,
  type ClientWorkbookData,
} from "@/lib/tradebook/client-preview";

export type PreviewWorkerRequest = {
  data: ClientWorkbookData;
  patches: ClientCellPatch[];
  mappings: ClientSheetMapping[];
  discardedContractRows: number[];
  discardedLineItemRows: number[];
  requestId: number;
};

export type PreviewWorkerResponse =
  | { type: "complete"; requestId: number; data: ClientWorkbookData }
  | { type: "error"; requestId: number; message: string };

self.onmessage = (event: MessageEvent<PreviewWorkerRequest>) => {
  const request = event.data;
  try {
    const data = buildClientPreviewWorkbook(request.data, request.patches, {
      mappings: request.mappings,
      discardedContractRows: request.discardedContractRows,
      discardedLineItemRows: request.discardedLineItemRows,
    });
    const response: PreviewWorkerResponse = {
      type: "complete",
      requestId: request.requestId,
      data,
    };
    self.postMessage(response);
  } catch (error) {
    const response: PreviewWorkerResponse = {
      type: "error",
      requestId: request.requestId,
      message:
        error instanceof Error
          ? error.message
          : "Workbook recalculation failed.",
    };
    self.postMessage(response);
  }
};
