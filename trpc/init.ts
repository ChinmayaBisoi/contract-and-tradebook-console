import { initTRPC, TRPCError } from "@trpc/server";

import { logger } from "@/lib/logger";
import { getOrCreateRequestId } from "@/lib/request-id";
import { safeLogMeta } from "@/lib/safe-log-meta";

export type AuthContext = {
  clerkUserId: string;
  email: string;
  name: string | null;
};

export type AppDb = Record<string, unknown>;

export type TRPCContext = {
  headers: Headers;
  requestId?: string;
  auth?: AuthContext | null;
  db?: AppDb;
};

async function resolveRequestAuth(): Promise<AuthContext | null> {
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const session = await auth();

  if (!session.userId) {
    return null;
  }

  const user = await currentUser();

  return {
    clerkUserId: session.userId,
    email: user?.primaryEmailAddress?.emailAddress ?? "",
    name: user?.fullName ?? user?.username ?? null,
  };
}

async function resolveDb() {
  const { prisma } = await import("@/lib/prisma");

  return prisma;
}

export const createTRPCContext = async (
  opts: TRPCContext,
): Promise<TRPCContext> => {
  return {
    headers: opts.headers,
    requestId: opts.requestId ?? getOrCreateRequestId(opts.headers),
    auth: opts.auth,
    db: opts.db,
  };
};

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create();

export const createTRPCRouter = t.router;
const loggingMiddleware = t.middleware(async ({ ctx, input, next, path, type }) => {
  const startedAt = Date.now();
  const requestLogger = logger.child({
    requestId: ctx.requestId,
    path,
    type,
  });

  requestLogger.debug("trpc.request.start", safeLogMeta(input));

  try {
    const result = await next();
    const durationMs = Date.now() - startedAt;

    if (result.ok) {
      requestLogger.debug("trpc.request.ok", {
        durationMs,
        userId: ctx.auth?.clerkUserId,
      });
      return result;
    }

    requestLogger.error("trpc.request.error", {
      durationMs,
      userId: ctx.auth?.clerkUserId,
      errorCode: result.error.code,
      errorMessage: result.error.message,
    });
    return result;
  } catch (error) {
    requestLogger.error("trpc.request.exception", {
      durationMs: Date.now() - startedAt,
      userId: ctx.auth?.clerkUserId,
      error,
    });
    throw error;
  }
});

export const baseProcedure = t.procedure.use(loggingMiddleware);

export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const auth = ctx.auth ?? (await resolveRequestAuth());

  if (!auth?.clerkUserId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  const db = ctx.db ?? (await resolveDb());

  return next({
    ctx: {
      ...ctx,
      auth,
      db,
    },
  });
});
