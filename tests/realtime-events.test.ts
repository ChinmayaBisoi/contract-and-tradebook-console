// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  publishRealtimeEvent,
  subscribeToRealtimeEvents,
} from "@/lib/realtime/events";

describe("realtime event bus", () => {
  it("publishes organisation-scoped events to matching org subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToRealtimeEvents(
      { organisationId: "org_1" },
      listener,
    );

    publishRealtimeEvent({
      organisationId: "org_1",
      entity: "contract",
      action: "created",
      entityId: "contract_1",
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "org_1",
        entity: "contract",
        action: "created",
        entityId: "contract_1",
      }),
    );

    unsubscribe();
  });

  it("publishes user-scoped events only to matching dashboard subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToRealtimeEvents(
      { userId: "user_1" },
      listener,
    );

    publishRealtimeEvent({
      entity: "organisation",
      action: "deleted",
      entityId: "org_1",
      userIds: ["user_2"],
    });
    publishRealtimeEvent({
      entity: "organisation",
      action: "deleted",
      entityId: "org_1",
      userIds: ["user_1"],
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "organisation",
        action: "deleted",
        entityId: "org_1",
      }),
    );

    unsubscribe();
  });

  it("filters by entity and entity id when requested", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToRealtimeEvents(
      {
        organisationId: "org_1",
        entity: "lineItem",
        entityId: "line_1",
      },
      listener,
    );

    publishRealtimeEvent({
      organisationId: "org_1",
      entity: "lineItem",
      action: "updated",
      entityId: "line_2",
    });
    publishRealtimeEvent({
      organisationId: "org_1",
      entity: "contract",
      action: "updated",
      entityId: "contract_1",
    });

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });
});
