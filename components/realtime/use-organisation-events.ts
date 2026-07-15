"use client";

import { useEffect, useRef } from "react";

import {
  REALTIME_EVENT_NAMES,
  type RealtimeEntity,
  type RealtimeEvent,
} from "@/lib/realtime/events";

export function useOrganisationEvents({
  organisationId,
  entity,
  entityId,
  onEvent,
}: {
  organisationId: string;
  entity?: RealtimeEntity;
  entityId?: string;
  onEvent: (event: RealtimeEvent) => void;
}) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const search = new URLSearchParams();
    if (entity) {
      search.set("entity", entity);
    }
    if (entityId) {
      search.set("entityId", entityId);
    }

    const query = search.toString();
    const eventSource = new EventSource(
      `/api/org/${organisationId}/events${query ? `?${query}` : ""}`,
    );
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        onEventRef.current(JSON.parse(event.data) as RealtimeEvent);
      } catch {
        // Ignore malformed payloads so the stream can continue.
      }
    };

    for (const eventName of REALTIME_EVENT_NAMES) {
      eventSource.addEventListener(eventName, handleMessage);
    }

    return () => {
      eventSource.close();
    };
  }, [entity, entityId, organisationId]);
}
