import { TRPCError } from "@trpc/server";

export function assertDraftContract(contract: { status: string }) {
  if (contract.status !== "DRAFT") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Only draft contracts can be modified.",
    });
  }
}
