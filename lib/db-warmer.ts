import "server-only";

import { logger } from "@/lib/logger";
import { isNeonDatabase } from "@/lib/prisma";

const DEFAULT_WARM_COOLDOWN_MS = 5 * 60_000;

type DbWarmerState = {
  lastWarmedAt: number;
  inFlight: Promise<void> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __contractviewDbWarmerState: DbWarmerState | undefined;
}

function getDbWarmerState() {
  if (!globalThis.__contractviewDbWarmerState) {
    globalThis.__contractviewDbWarmerState = {
      lastWarmedAt: 0,
      inFlight: null,
    };
  }

  return globalThis.__contractviewDbWarmerState;
}

function getWarmCooldownMs() {
  const raw = process.env.DB_WARM_COOLDOWN_MS;
  if (!raw) {
    return DEFAULT_WARM_COOLDOWN_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WARM_COOLDOWN_MS;
  }

  return parsed;
}

function shouldWarmDatabase() {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return false;
  }

  return isNeonDatabase(connectionString);
}

export async function warmDatabaseIfNeeded() {
  if (!shouldWarmDatabase()) {
    return;
  }

  const state = getDbWarmerState();
  const now = Date.now();
  const cooldownMs = getWarmCooldownMs();

  if (now - state.lastWarmedAt < cooldownMs) {
    return;
  }

  if (state.inFlight) {
    return state.inFlight;
  }

  state.inFlight = (async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    state.lastWarmedAt = Date.now();
  })()
    .catch((error: unknown) => {
      logger.warn("db_warmer_ping_failed", { error });
    })
    .finally(() => {
      state.inFlight = null;
    });

  return state.inFlight;
}

export function __resetDbWarmerStateForTests() {
  globalThis.__contractviewDbWarmerState = undefined;
}
