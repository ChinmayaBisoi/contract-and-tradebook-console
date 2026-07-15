const SAFE_ID_KEYS = [
  "organisationId",
  "contractId",
  "uploadId",
  "lineItemId",
  "importId",
] as const;

type SafeIdKey = (typeof SAFE_ID_KEYS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setSafeValue(
  target: Partial<Record<SafeIdKey, string>>,
  key: SafeIdKey,
  value: unknown,
) {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  target[key] = value;
}

function collectSafeIds(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  const safeFields: Partial<Record<SafeIdKey, string>> = {};
  for (const key of SAFE_ID_KEYS) {
    setSafeValue(safeFields, key, value[key]);
  }

  if (isRecord(value.input)) {
    for (const key of SAFE_ID_KEYS) {
      setSafeValue(safeFields, key, value.input[key]);
    }
  }

  if (isRecord(value.json)) {
    for (const key of SAFE_ID_KEYS) {
      setSafeValue(safeFields, key, value.json[key]);
    }
  }

  return safeFields;
}

export function safeLogMeta(input: unknown) {
  if (Array.isArray(input)) {
    return {
      batchSize: input.length,
    };
  }

  return collectSafeIds(input);
}
