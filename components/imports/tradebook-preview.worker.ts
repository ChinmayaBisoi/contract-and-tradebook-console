import {
  buildClientPreviewWorkbook,
  type ClientWorkbookData,
} from "@/lib/tradebook/client-preview";
import type {
  PreviewWorkerRequest,
  PreviewWorkerResponse,
} from "@/components/imports/tradebook-preview-worker-types";

let cachedBaseData: ClientWorkbookData | null = null;

self.onmessage = (event: MessageEvent<PreviewWorkerRequest>) => {
  const request = event.data;
  if (request.type === "init") {
    cachedBaseData = request.data;
    return;
  }

  if (!cachedBaseData) {
    const response: PreviewWorkerResponse = {
      type: "error",
      requestId: request.requestId,
      message: "Workbook data has not been initialized.",
    };
    self.postMessage(response);
    return;
  }

  try {
    const data = buildClientPreviewWorkbook(cachedBaseData, request.patches, {
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
