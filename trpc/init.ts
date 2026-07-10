import { initTRPC, TRPCError } from "@trpc/server";

export type AuthContext = {
  clerkUserId: string;
  email: string;
  name: string | null;
};

export type AppDb = Record<string, unknown>;

export type TRPCContext = {
  headers: Headers;
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
    auth: opts.auth,
    db: opts.db,
  };
};

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create();

export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
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
