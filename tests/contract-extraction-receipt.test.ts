// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createContractExtractionReceipt,
  verifyContractExtractionReceipt,
} from "@/lib/contracts/contract-extraction-receipt";

describe("contract extraction receipts", () => {
  it("accepts a receipt for the issuing user and organisation", () => {
    const receipt = createContractExtractionReceipt({
      organisationId: "org_1",
      clerkUserId: "user_1",
      secret: "secret",
      now: new Date("2026-07-15T10:00:00.000Z"),
    });

    expect(() =>
      verifyContractExtractionReceipt({
        receipt,
        organisationId: "org_1",
        clerkUserId: "user_1",
        secret: "secret",
        now: new Date("2026-07-15T10:29:59.000Z"),
      }),
    ).not.toThrow();
  });

  it.each([
    { organisationId: "org_2", clerkUserId: "user_1", secret: "secret" },
    { organisationId: "org_1", clerkUserId: "user_2", secret: "secret" },
    { organisationId: "org_1", clerkUserId: "user_1", secret: "wrong" },
  ])("rejects a receipt outside its signed scope", (scope) => {
    const receipt = createContractExtractionReceipt({
      organisationId: "org_1",
      clerkUserId: "user_1",
      secret: "secret",
    });

    expect(() =>
      verifyContractExtractionReceipt({ receipt, ...scope }),
    ).toThrow("AI extraction receipt is invalid or expired.");
  });

  it("rejects an expired receipt", () => {
    const receipt = createContractExtractionReceipt({
      organisationId: "org_1",
      clerkUserId: "user_1",
      secret: "secret",
      now: new Date("2026-07-15T10:00:00.000Z"),
    });

    expect(() =>
      verifyContractExtractionReceipt({
        receipt,
        organisationId: "org_1",
        clerkUserId: "user_1",
        secret: "secret",
        now: new Date("2026-07-15T10:30:01.000Z"),
      }),
    ).toThrow("AI extraction receipt is invalid or expired.");
  });
});
