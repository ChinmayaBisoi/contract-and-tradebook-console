import {
  publishRealtimeEvent,
  subscribeToRealtimeEvents,
  type RealtimeEvent,
} from "@/lib/realtime/events";

export type TradebookImportEventType =
  | "upload.updated"
  | "import.preparing"
  | "import.failed"
  | "import.mapped"
  | "import.imported";

export type TradebookImportEvent = {
  type: TradebookImportEventType;
  organisationId: string;
  importId: string;
  uploadId?: string;
  status?: string;
  occurredAt: string;
};

function asTradebookEvent(event: RealtimeEvent): TradebookImportEvent | null {
  if (event.entity !== "upload" || !event.organisationId) {
    return null;
  }

  const importId = event.entityId;
  const uploadId = event.uploadId ?? event.entityId;

  return {
    type: (event.name as TradebookImportEventType) ?? "upload.updated",
    organisationId: event.organisationId,
    importId,
    uploadId,
    status: event.status,
    occurredAt: event.occurredAt,
  };
}

export function publishTradebookEvent(
  event: Omit<TradebookImportEvent, "occurredAt">,
) {
  const payload = publishRealtimeEvent({
    name: event.type,
    entity: "upload",
    action: "updated",
    organisationId: event.organisationId,
    entityId: event.importId,
    uploadId: event.uploadId ?? event.importId,
    status: event.status,
  });

  return asTradebookEvent(payload) as TradebookImportEvent;
}

export function subscribeToTradebookEvents(
  filter: {
    organisationId: string;
    importId?: string;
  },
  listener: (event: TradebookImportEvent) => void,
) {
  return subscribeToRealtimeEvents(
    {
      organisationId: filter.organisationId,
      entity: "upload",
      ...(filter.importId ? { entityId: filter.importId } : {}),
    },
    (event) => {
      const payload = asTradebookEvent(event);
      if (payload) {
        listener(payload);
      }
    },
  );
}
