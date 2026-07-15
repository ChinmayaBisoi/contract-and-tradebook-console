import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

describe("draft contract line-item UI affordances", () => {
  it("shows derived contract totals on the detail surface without making them editable", () => {
    const detail = read("components/contracts/contract-detail.tsx");
    const editDialog = read("components/contracts/edit-contract-dialog.tsx");

    expect(detail).toContain("Contract total");
    expect(editDialog).toContain("Derived contract total");
    expect(editDialog).toContain("readOnly");
  });

  it("adds draft-only edit actions to both line-item ledger views", () => {
    const ledger = read("components/operations/line-items.tsx");
    const contracts = read("components/operations/contracts.tsx");

    expect(ledger).toContain("EditLineItemDialog");
    expect(ledger).toContain("EditContractDialog");
    expect(ledger).toContain('data?.contract?.status === "DRAFT"');
    expect(ledger).toContain("deleteLineItem");
    expect(ledger).toContain('row.contract.status === "DRAFT"');
    expect(contracts).toContain("EditContractDialog");
    expect(contracts).toContain('row.status === "DRAFT"');
  });
});
