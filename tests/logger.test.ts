import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";
import { safeLogMeta } from "@/lib/safe-log-meta";

describe("logger", () => {
  afterEach(() => {
    delete process.env.LOG_LEVEL;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("respects LOG_LEVEL filtering", async () => {
    process.env.LOG_LEVEL = "warn";
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { logger: freshLogger } = await import("@/lib/logger");
    freshLogger.debug("trpc.request.start", { requestId: "req_1" });
    freshLogger.warn("trpc.request.error", { requestId: "req_1" });

    expect(debugSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("writes one-line JSON output", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("api.request.ok", {
      requestId: "req_1",
      status: 200,
    });

    expect(infoSpy).toHaveBeenCalledOnce();
    const [line] = infoSpy.mock.calls[0] ?? [];
    const parsed = JSON.parse(String(line)) as {
      level: string;
      event: string;
      requestId: string;
      status: number;
      ts: string;
    };

    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("api.request.ok");
    expect(parsed.requestId).toBe("req_1");
    expect(parsed.status).toBe(200);
    expect(typeof parsed.ts).toBe("string");
  });
});

describe("safeLogMeta", () => {
  it("keeps only approved metadata keys", () => {
    expect(
      safeLogMeta({
        organisationId: "org_1",
        contractId: "ctr_1",
        sensitive: "do-not-log",
      }),
    ).toEqual({
      organisationId: "org_1",
      contractId: "ctr_1",
    });
  });
});
