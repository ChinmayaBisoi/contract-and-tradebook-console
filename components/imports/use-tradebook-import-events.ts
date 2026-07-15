"use client";

import { useEffect, useRef } from "react";

import type { TradebookImportEvent } from "@/lib/tradebook/events";

export function useTradebookImportEvents({
  organisationId,
  importId,
  onEvent,
}: {
  organisationId: string;
  importId?: string;
  onEvent: (event: TradebookImportEvent) => void;
}) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const search = new URLSearchParams();
    if (importId) {
      search.set("importId", importId);
    }

    const eventSource = new EventSource(
      `/api/org/${organisationId}/imports/events?${search.toString()}`,
    );
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        onEventRef.current(JSON.parse(event.data) as TradebookImportEvent);
      } catch {
        // Ignore malformed payloads so the stream can continue.
      }
    };

    eventSource.addEventListener("upload.updated", handleMessage);
    eventSource.addEventListener("import.preparing", handleMessage);
    eventSource.addEventListener("import.failed", handleMessage);
    eventSource.addEventListener("import.mapped", handleMessage);
    eventSource.addEventListener("import.imported", handleMessage);

    return () => {
      eventSource.close();
    };
  }, [organisationId, importId]);
}
