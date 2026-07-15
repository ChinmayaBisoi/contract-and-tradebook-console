import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { logger } from "@/lib/logger";
import { getOrCreateRequestId } from "@/lib/request-id";
import { createTRPCContext } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";

export const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        headers: req.headers,
        requestId: getOrCreateRequestId(req.headers),
      }),
    onError({ ctx, error, path, type }) {
      logger.error("trpc.http.error", {
        requestId: ctx?.requestId ?? getOrCreateRequestId(req.headers),
        method: req.method,
        path,
        type,
        errorCode: error.code,
        errorMessage: error.message,
      });
    },
  });

export { handler as GET, handler as POST };
