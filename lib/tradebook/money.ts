/** Truncate to 2 decimal places (toward zero), not round. */

const MONEY_SCALE = BigInt(100);
const RAW_SCALE = BigInt(1_000_000);
const RAW_DIGITS = 6;

function decimalString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(12).replace(/\.?0+$/, "");
  }
  if (typeof value === "string") return value.trim();
  return "";
}

export function toRawScaled(value: unknown): bigint | null {
  const normalized = decimalString(value);
  if (!normalized) return null;
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const sign = match[1] === "-" ? BigInt(-1) : BigInt(1);
  const integer = BigInt(match[2] ?? "0");
  const fraction = BigInt(
    (match[3] ?? "").slice(0, RAW_DIGITS).padEnd(RAW_DIGITS, "0"),
  );
  return sign * (integer * RAW_SCALE + fraction);
}

export function truncateToMoney(rawScaled: bigint): bigint {
  return rawScaled / (RAW_SCALE / MONEY_SCALE);
}

export function moneyToNumber(moneyScaled: bigint): number {
  return Number(moneyScaled) / Number(MONEY_SCALE);
}

export function truncateMoney(value: unknown): number | null {
  const raw = toRawScaled(value);
  if (raw === null) return null;
  return moneyToNumber(truncateToMoney(raw));
}

export function multiplyToMoney(left: unknown, right: unknown): number | null {
  const leftRaw = toRawScaled(left);
  const rightRaw = toRawScaled(right);
  if (leftRaw === null || rightRaw === null) return null;
  const productRaw = (leftRaw * rightRaw) / RAW_SCALE;
  return moneyToNumber(truncateToMoney(productRaw));
}

export function formatMoneyDisplay(value: unknown): string {
  const truncated = truncateMoney(value);
  if (truncated === null) {
    if (value === null || value === undefined) return "";
    return String(value);
  }
  return truncated.toFixed(2);
}
