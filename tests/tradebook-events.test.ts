// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  publishTradebookEvent,
  subscribeToTradebookEvents,
} from "@/lib/tradebook/events";

describe("tradebook event bus", () => {
  it("publishes matching organisation/import events to subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTradebookEvents(
      {
        organisationId: "org_1",
        importId: "import_1",
      },
      listener,
    );

    publishTradebookEvent({
      organisationId: "org_1",
      importId: "import_1",
      uploadId: "upload_1",
      type: "import.mapped",
      status: "MAPPED",
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "org_1",
        importId: "import_1",
        type: "import.mapped",
        status: "MAPPED",
      }),
    );

    unsubscribe();
  });

  it("filters out unrelated imports and organisations", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTradebookEvents(
      {
        organisationId: "org_1",
        importId: "import_1",
      },
      listener,
    );

    publishTradebookEvent({
      organisationId: "org_2",
      importId: "import_1",
      uploadId: "upload_1",
      type: "import.failed",
      status: "FAILED",
    });
    publishTradebookEvent({
      organisationId: "org_1",
      importId: "import_2",
      uploadId: "upload_1",
      type: "import.failed",
      status: "FAILED",
    });

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });
});
