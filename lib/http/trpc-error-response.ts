import { TRPCError } from "@trpc/server";

const statusByCode = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
} as const;

export function trpcErrorResponse(error: unknown) {
  if (!(error instanceof TRPCError)) return null;

  const status = statusByCode[error.code as keyof typeof statusByCode] ?? 500;
  return new Response(error.message, { status });
}
