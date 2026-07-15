export type ContractStatus = "DRAFT" | "FINALIZED" | "ARCHIVED";

export const contractStatusLabels: Record<ContractStatus, string> = {
  DRAFT: "Draft",
  FINALIZED: "Finalized",
  ARCHIVED: "Archived",
};

export function getSelectableContractStatuses(
  current: ContractStatus,
): ContractStatus[] {
  if (current === "DRAFT") {
    return ["DRAFT", "FINALIZED"];
  }

  if (current === "FINALIZED") {
    return ["FINALIZED", "ARCHIVED"];
  }

  return ["ARCHIVED"];
}

export function getStatusTransitionLabel(
  next: Extract<ContractStatus, "FINALIZED" | "ARCHIVED">,
) {
  return next === "FINALIZED" ? "finalize" : "archive";
}
