"use client";

import { useEffect, useRef, useState } from "react";

import type {
  ClientCellPatch,
  ClientSheetMapping,
  ClientWorkbookData,
} from "@/lib/tradebook/client-preview";
import { buildClientPreviewWorkbook } from "@/lib/tradebook/client-preview";

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

  useEffect(() => {
    if (!enabled || !baseData) {
      setLiveData(baseData);
      seededForBaseRef.current = undefined;
      return;
    }

    const isFirstForBase = seededForBaseRef.current !== baseData;
    const delayMs = isFirstForBase ? 0 : DEBOUNCE_MS;
    setIsRecalculating(true);

    const timer = window.setTimeout(() => {
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
