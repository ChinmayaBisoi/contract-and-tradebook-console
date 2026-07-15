export const REQUEST_ID_HEADER = "x-request-id";

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateRequestId(
  headers: Pick<Headers, "get">,
): string {
  const existingRequestId = headers.get(REQUEST_ID_HEADER)?.trim();

  if (existingRequestId) {
    return existingRequestId;
  }

  return createRequestId();
}
