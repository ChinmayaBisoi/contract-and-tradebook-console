import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const RECEIPT_LIFETIME_MS = 30 * 60 * 1000;
const SIGNING_CONTEXT = "contract-extraction-receipt:v1:";
const INVALID_RECEIPT_MESSAGE = "AI extraction receipt is invalid or expired.";

const receiptPayloadSchema = z.object({
  version: z.literal(1),
  organisationId: z.string().min(1),
  clerkUserId: z.string().min(1),
  expiresAt: z.number().int().positive(),
  nonce: z.string().uuid(),
});

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${SIGNING_CONTEXT}${payload}`)
    .digest("base64url");
}

function invalidReceipt(): never {
  throw new Error(INVALID_RECEIPT_MESSAGE);
}

export function createContractExtractionReceipt({
  organisationId,
  clerkUserId,
  secret,
  now = new Date(),
}: {
  organisationId: string;
  clerkUserId: string;
  secret: string;
  now?: Date;
}) {
  if (!secret) invalidReceipt();

  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      organisationId,
      clerkUserId,
      expiresAt: now.getTime() + RECEIPT_LIFETIME_MS,
      nonce: randomUUID(),
    }),
  ).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

export function verifyContractExtractionReceipt({
  receipt,
  organisationId,
  clerkUserId,
  secret,
  now = new Date(),
}: {
  receipt: string;
  organisationId: string;
  clerkUserId: string;
  secret: string;
  now?: Date;
}) {
  if (!secret) invalidReceipt();

  const [encodedPayload, suppliedSignature, extra] = receipt.split(".");
  if (!encodedPayload || !suppliedSignature || extra) invalidReceipt();

  const expectedSignature = sign(encodedPayload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    invalidReceipt();
  }

  try {
    const payload = receiptPayloadSchema.parse(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
    );
    if (
      payload.organisationId !== organisationId ||
      payload.clerkUserId !== clerkUserId ||
      payload.expiresAt < now.getTime()
    ) {
      invalidReceipt();
    }
  } catch {
    invalidReceipt();
  }
}
