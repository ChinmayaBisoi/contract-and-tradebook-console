import "server-only";

import { logger } from "@/lib/logger";
import { getOrCreateRequestId } from "@/lib/request-id";

export async function withApiLog(
  route: string,
  req: Request,
  fn: () => Promise<Response>,
) {
  const startedAt = Date.now();
  const requestId = getOrCreateRequestId(req.headers);
  const requestLogger = logger.child({
    requestId,
    method: req.method,
    route,
  });

  requestLogger.debug("api.request.start");

  try {
    const response = await fn();
    requestLogger.debug("api.request.ok", {
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    requestLogger.error("api.request.error", {
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}
