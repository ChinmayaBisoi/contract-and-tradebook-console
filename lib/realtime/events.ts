export type RealtimeEntity =
  | "organisation"
  | "contract"
  | "lineItem"
  | "invitation"
  | "upload";

export type RealtimeAction = "created" | "updated" | "deleted";

export const REALTIME_EVENT_NAMES = [
  "organisation.created",
  "organisation.updated",
  "organisation.deleted",
  "contract.created",
  "contract.updated",
  "contract.deleted",
  "lineItem.created",
  "lineItem.updated",
  "lineItem.deleted",
  "invitation.created",
  "invitation.updated",
  "invitation.deleted",
  "upload.created",
  "upload.updated",
  "upload.deleted",
] as const;

export type RealtimeEventName = (typeof REALTIME_EVENT_NAMES)[number];

export type RealtimeEvent = {
  name: string;
  entity: RealtimeEntity;
  action: RealtimeAction;
  entityId: string;
  organisationId?: string;
  userIds?: string[];
  contractId?: string;
  uploadId?: string;
  invitationId?: string;
  status?: string;
  occurredAt: string;
};

type RealtimeSubscriber = (event: RealtimeEvent) => void;

const subscribers = new Set<RealtimeSubscriber>();

function defaultEventName(entity: RealtimeEntity, action: RealtimeAction) {
  return `${entity}.${action}`;
}

export function publishRealtimeEvent(
  event: Omit<RealtimeEvent, "occurredAt" | "name"> & { name?: string },
) {
  const payload: RealtimeEvent = {
    ...event,
    name: event.name ?? defaultEventName(event.entity, event.action),
    occurredAt: new Date().toISOString(),
  };

  for (const subscriber of subscribers) {
    subscriber(payload);
  }

  return payload;
}

export function subscribeToRealtimeEvents(
  filter: {
    userId?: string;
    organisationId?: string;
    entity?: RealtimeEntity;
    entityId?: string;
  },
  listener: RealtimeSubscriber,
) {
  const subscriber: RealtimeSubscriber = (event) => {
    if (filter.userId && !event.userIds?.includes(filter.userId)) return;
    if (filter.organisationId && event.organisationId !== filter.organisationId) {
      return;
    }
    if (filter.entity && event.entity !== filter.entity) return;
    if (filter.entityId && event.entityId !== filter.entityId) return;
    listener(event);
  };

  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
