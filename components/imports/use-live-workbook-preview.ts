"use client";

import { useEffect, useRef, useState } from "react";

import type {
  ClientCellPatch,
  ClientSheetMapping,
  ClientWorkbookData,
} from "@/lib/tradebook/client-preview";
import { buildClientPreviewWorkbook } from "@/lib/tradebook/client-preview";
import type {
  PreviewWorkerRequest,
  PreviewWorkerResponse,
} from "@/components/imports/tradebook-preview-worker-types";

const DEBOUNCE_MS = 400;

export function useLiveWorkbookPreview({
  baseData,
  patches,
  mappings,
  discardedContractRows,
  discardedLineItemRows,
  enabled,
}: {
  baseData: ClientWorkbookData | undefined;
  patches: ClientCellPatch[];
  mappings: ClientSheetMapping[];
  discardedContractRows: number[];
  discardedLineItemRows: number[];
  enabled: boolean;
}) {
  const [liveData, setLiveData] = useState<ClientWorkbookData | undefined>(
    baseData,
  );
  const [isRecalculating, setIsRecalculating] = useState(false);
  const seededForBaseRef = useRef<ClientWorkbookData | undefined>(undefined);
  const workerRef = useRef<Worker | null>(null);
  const latestRequestIdRef = useRef(0);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      latestRequestIdRef.current = 0;
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !baseData) {
      setLiveData(baseData);
      setIsRecalculating(false);
      seededForBaseRef.current = undefined;
      workerRef.current?.terminate();
      workerRef.current = null;
      latestRequestIdRef.current = 0;
      return;
    }

    const supportsWorker = typeof Worker !== "undefined";
    const isFirstForBase = seededForBaseRef.current !== baseData;
    const delayMs = isFirstForBase ? 0 : DEBOUNCE_MS;
    setIsRecalculating(true);

    const timer = window.setTimeout(() => {
      if (supportsWorker) {
        if (!workerRef.current) {
          const worker = new Worker(
            new URL("./tradebook-preview.worker.ts", import.meta.url),
          );
          worker.onmessage = (event: MessageEvent<PreviewWorkerResponse>) => {
            const payload = event.data;
            if (payload.requestId !== latestRequestIdRef.current) return;

            if (payload.type === "complete") {
              setLiveData(payload.data);
            }
            setIsRecalculating(false);
          };
          workerRef.current = worker;
        }

        if (seededForBaseRef.current !== baseData) {
          const initRequest: PreviewWorkerRequest = {
            type: "init",
            data: baseData,
          };
          workerRef.current.postMessage(initRequest);
          seededForBaseRef.current = baseData;
        }

        const nextRequestId = latestRequestIdRef.current + 1;
        latestRequestIdRef.current = nextRequestId;
        const request: PreviewWorkerRequest = {
          type: "recalc",
          requestId: nextRequestId,
          patches,
          mappings,
          discardedContractRows,
          discardedLineItemRows,
        };
        workerRef.current.postMessage(request);
        return;
      }

      try {
        setLiveData(
          buildClientPreviewWorkbook(baseData, patches, {
            mappings,
            discardedContractRows,
            discardedLineItemRows,
          }),
        );
        seededForBaseRef.current = baseData;
      } finally {
        setIsRecalculating(false);
      }
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    baseData,
    discardedContractRows,
    discardedLineItemRows,
    enabled,
    mappings,
    patches,
  ]);

  return { liveData, isRecalculating };
}
