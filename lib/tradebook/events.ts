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

type TradebookImportSubscriber = (event: TradebookImportEvent) => void;

const subscribers = new Set<TradebookImportSubscriber>();

export function publishTradebookEvent(
  event: Omit<TradebookImportEvent, "occurredAt">,
) {
  const payload: TradebookImportEvent = {
    ...event,
    occurredAt: new Date().toISOString(),
  };

  for (const subscriber of subscribers) {
    subscriber(payload);
  }

  return payload;
}

export function subscribeToTradebookEvents(
  filter: {
    organisationId: string;
    importId?: string;
  },
  listener: TradebookImportSubscriber,
) {
  const subscriber: TradebookImportSubscriber = (event) => {
    if (event.organisationId !== filter.organisationId) return;
    if (filter.importId && event.importId !== filter.importId) return;
    listener(event);
  };

  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
