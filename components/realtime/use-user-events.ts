"use client";

import { useEffect, useRef } from "react";

import {
  REALTIME_EVENT_NAMES,
  type RealtimeEvent,
} from "@/lib/realtime/events";

export function useUserEvents({
  onEvent,
}: {
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

    const eventSource = new EventSource("/api/events");
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
  }, []);
}
