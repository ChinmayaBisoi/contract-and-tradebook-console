import { describe, expect, it } from "vitest";

import {
  getSelectableContractStatuses,
  getStatusTransitionLabel,
} from "@/lib/contracts/contract-status";

describe("contract status helpers", () => {
  it("only exposes forward status options in the edit form", () => {
    expect(getSelectableContractStatuses("DRAFT")).toEqual(["DRAFT", "FINALIZED"]);
    expect(getSelectableContractStatuses("FINALIZED")).toEqual([
      "FINALIZED",
      "ARCHIVED",
    ]);
    expect(getSelectableContractStatuses("ARCHIVED")).toEqual(["ARCHIVED"]);
  });

  it("labels status transitions for confirmation copy", () => {
    expect(getStatusTransitionLabel("FINALIZED")).toBe("finalize");
    expect(getStatusTransitionLabel("ARCHIVED")).toBe("archive");
  });
});
