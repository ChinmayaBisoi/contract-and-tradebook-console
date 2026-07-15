// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

type PrismaMock = {
  prisma: {
    $queryRaw: ReturnType<typeof vi.fn>;
  };
};

function setWarmStateToEmpty() {
  (
    globalThis as {
      __contractviewDbWarmerState?: {
        lastWarmedAt: number;
        inFlight: Promise<void> | null;
      };
    }
  ).__contractviewDbWarmerState = undefined;
}

describe("db warmer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setWarmStateToEmpty();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("skips warm ping outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://user:pass@ep-cool-mud-a1b2c3d4.neon.tech/neondb",
    );

    const queryRaw = vi.fn(async () => 1);
    vi.doMock("@/lib/prisma", (): PrismaMock & { isNeonDatabase: (url: string) => boolean } => ({
      isNeonDatabase: (url: string) => url.includes("neon.tech"),
      prisma: {
        $queryRaw: queryRaw,
      },
    }));

    const { warmDatabaseIfNeeded } = await import("@/lib/db-warmer");
    await warmDatabaseIfNeeded();

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("skips warm ping when database is not Neon", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://contractview:contractview@localhost:5433/contractview_dev",
    );

    const queryRaw = vi.fn(async () => 1);
    vi.doMock("@/lib/prisma", (): PrismaMock & { isNeonDatabase: (url: string) => boolean } => ({
      isNeonDatabase: (url: string) => url.includes("neon.tech"),
      prisma: {
        $queryRaw: queryRaw,
      },
    }));

    const { warmDatabaseIfNeeded } = await import("@/lib/db-warmer");
    await warmDatabaseIfNeeded();

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("respects cooldown and only warms once", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://user:pass@ep-cool-mud-a1b2c3d4.neon.tech/neondb",
    );

    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const queryRaw = vi.fn(async () => 1);
    vi.doMock("@/lib/prisma", (): PrismaMock & { isNeonDatabase: (url: string) => boolean } => ({
      isNeonDatabase: (url: string) => url.includes("neon.tech"),
      prisma: {
        $queryRaw: queryRaw,
      },
    }));

    const { warmDatabaseIfNeeded } = await import("@/lib/db-warmer");
    await warmDatabaseIfNeeded();
    now = 12_000;
    await warmDatabaseIfNeeded();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent warm requests into one ping", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://user:pass@ep-cool-mud-a1b2c3d4.neon.tech/neondb",
    );

    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    const queryRaw = vi.fn(async () => {
      await pending;
      return 1;
    });

    vi.doMock("@/lib/prisma", (): PrismaMock & { isNeonDatabase: (url: string) => boolean } => ({
      isNeonDatabase: (url: string) => url.includes("neon.tech"),
      prisma: {
        $queryRaw: queryRaw,
      },
    }));

    const { warmDatabaseIfNeeded } = await import("@/lib/db-warmer");
    const first = warmDatabaseIfNeeded();
    const second = warmDatabaseIfNeeded();

    expect(queryRaw).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([first, second]);

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("retries on next call after a failed warm ping", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://user:pass@ep-cool-mud-a1b2c3d4.neon.tech/neondb",
    );

    const queryRaw = vi
      .fn()
      .mockRejectedValueOnce(new Error("cold start"))
      .mockResolvedValueOnce(1);

    vi.doMock("@/lib/prisma", (): PrismaMock & { isNeonDatabase: (url: string) => boolean } => ({
      isNeonDatabase: (url: string) => url.includes("neon.tech"),
      prisma: {
        $queryRaw: queryRaw,
      },
    }));

    const { warmDatabaseIfNeeded } = await import("@/lib/db-warmer");
    await warmDatabaseIfNeeded();
    await warmDatabaseIfNeeded();

    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
