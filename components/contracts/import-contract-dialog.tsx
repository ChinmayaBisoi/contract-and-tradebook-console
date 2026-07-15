"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileJsonIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { getMutationErrorMessage } from "@/components/contracts/dialog-helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type ContractProposal,
  contractProposalSchema,
  parseContractJson,
} from "@/lib/contracts/contract-proposal";
import { useTRPC } from "@/trpc/client";

type ImportSource = "JSON" | "AI_EXTRACT";

let nextItemKey = 0;
function createItemKey() {
  nextItemKey += 1;
  return `contract-import-item-${nextItemKey}`;
}

function dateOnly(value: Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function readJsonFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () =>
      reject(new Error("The JSON file could not be read.")),
    );
    reader.readAsText(file);
  });
}

export function ImportContractDialog({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contractText, setContractText] = useState("");
  const [sourceType, setSourceType] = useState<ImportSource>("AI_EXTRACT");
  const [proposal, setProposal] = useState<ContractProposal | null>(null);
  const [itemKeys, setItemKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const extract = useMutation(trpc.contract.extract.mutationOptions());
  const importDraft = useMutation(trpc.contract.importDraft.mutationOptions());

  function reset() {
    setContractText("");
    setSourceType("AI_EXTRACT");
    setProposal(null);
    setItemKeys([]);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleExtract() {
    setError(null);
    try {
      const extracted = await extract.mutateAsync({
        organisationId,
        text: contractText,
      });
      setSourceType("AI_EXTRACT");
      setProposal({
        ...extracted,
        contract: {
          ...extracted.contract,
          poDate: new Date(extracted.contract.poDate),
          paymentTerms: extracted.contract.paymentTerms ?? undefined,
          deliveryTerms: extracted.contract.deliveryTerms ?? undefined,
        },
        items: extracted.items.map((item) => ({
          ...item,
          quantityUnit: item.quantityUnit ?? undefined,
          pricingUnit: item.pricingUnit ?? undefined,
        })),
      });
      setItemKeys(extracted.items.map(createItemKey));
    } catch (extractError) {
      setError(getMutationErrorMessage(extractError));
    }
  }

  async function handleJsonFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const parsed = parseContractJson(JSON.parse(await readJsonFile(file)));
      setSourceType("JSON");
      setProposal(parsed);
      setItemKeys(parsed.items.map(createItemKey));
    } catch (fileError) {
      setError(
        fileError instanceof Error
          ? fileError.message
          : "The JSON file does not match the contract format.",
      );
    }
  }

  function updateContract(
    field: keyof ContractProposal["contract"],
    value: string,
  ) {
    setProposal((current) =>
      current
        ? {
            ...current,
            contract: {
              ...current.contract,
              [field]:
                field === "poDate" ? new Date(`${value}T00:00:00.000Z`) : value,
            },
          }
        : current,
    );
  }

  function updateItem(
    index: number,
    field: keyof ContractProposal["items"][number],
    value: string,
  ) {
    setProposal((current) => {
      if (!current) return current;
      const items = [...current.items];
      const item = items[index];
      if (!item) return current;
      items[index] = {
        ...item,
        [field]:
          field === "quantity" || field === "unitPrice" ? Number(value) : value,
      };
      return { ...current, items };
    });
  }

  function addItem() {
    setProposal((current) =>
      current
        ? {
            ...current,
            items: [
              ...current.items,
              {
                description: "",
                quantity: 1,
                quantityUnit: undefined,
                unitPrice: 0,
                pricingUnit: undefined,
              },
            ],
          }
        : current,
    );
    setItemKeys((current) => [...current, createItemKey()]);
  }

  function removeItem(index: number) {
    setProposal((current) =>
      current
        ? {
            ...current,
            items: current.items.filter((_, itemIndex) => itemIndex !== index),
          }
        : current,
    );
    setItemKeys((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function handleAccept() {
    if (!proposal) return;
    setError(null);
    const parsed = contractProposalSchema.safeParse(proposal);
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Please review the contract values.",
      );
      return;
    }

    try {
      const created = await importDraft.mutateAsync({
        organisationId,
        sourceType,
        proposal: parsed.data,
      });
      await Promise.all([
        queryClient.invalidateQueries(
          trpc.contract.list.queryFilter({ organisationId }),
        ),
        queryClient.invalidateQueries(
          trpc.audit.list.queryFilter({ organisationId }),
        ),
      ]);
      toast.success("Contract draft imported");
      handleOpenChange(false);
      router.push(`/org/${organisationId}/contracts/${created.id}`);
    } catch (importError) {
      const message = getMutationErrorMessage(importError);
      setError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <SparklesIcon />
        Import contract
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {proposal ? "Review contract" : "Import contract"}
          </DialogTitle>
          <DialogDescription>
            {proposal
              ? "Review and edit every value before creating the draft."
              : "Extract a contract from text or upload one structured JSON file."}
          </DialogDescription>
        </DialogHeader>

        {proposal ? (
          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="import-client-name">
                  Client name
                </FieldLabel>
                <Input
                  id="import-client-name"
                  value={proposal.contract.clientName}
                  onChange={(event) =>
                    updateContract("clientName", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="import-po-ref">
                  PO reference number
                </FieldLabel>
                <Input
                  id="import-po-ref"
                  value={proposal.contract.poRefNo}
                  onChange={(event) =>
                    updateContract("poRefNo", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="import-po-date">PO date</FieldLabel>
                <Input
                  id="import-po-date"
                  type="date"
                  value={dateOnly(proposal.contract.poDate)}
                  onChange={(event) =>
                    updateContract("poDate", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="import-payment-terms">
                  Payment terms
                </FieldLabel>
                <Textarea
                  id="import-payment-terms"
                  value={proposal.contract.paymentTerms ?? ""}
                  onChange={(event) =>
                    updateContract("paymentTerms", event.target.value)
                  }
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="import-delivery-terms">
                  Delivery terms
                </FieldLabel>
                <Textarea
                  id="import-delivery-terms"
                  value={proposal.contract.deliveryTerms ?? ""}
                  onChange={(event) =>
                    updateContract("deliveryTerms", event.target.value)
                  }
                />
              </Field>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">Line items</h3>
                  <p className="text-sm text-muted-foreground">
                    Quantity multiplied by unit price determines each line
                    total.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addItem}
                >
                  <PlusIcon /> Add item
                </Button>
              </div>
              {proposal.items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No line items were found. You can create the draft as-is or
                  add one.
                </p>
              ) : null}
              {proposal.items.map((item, index) => (
                <div
                  key={itemKeys[index]}
                  className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-12"
                >
                  <Field className="md:col-span-4">
                    <FieldLabel htmlFor={`import-item-description-${index}`}>
                      Description
                    </FieldLabel>
                    <Input
                      id={`import-item-description-${index}`}
                      value={item.description}
                      onChange={(event) =>
                        updateItem(index, "description", event.target.value)
                      }
                    />
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor={`import-item-quantity-${index}`}>
                      Quantity
                    </FieldLabel>
                    <Input
                      id={`import-item-quantity-${index}`}
                      type="number"
                      min="0"
                      step="any"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(index, "quantity", event.target.value)
                      }
                    />
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor={`import-item-quantity-unit-${index}`}>
                      Quantity unit
                    </FieldLabel>
                    <Input
                      id={`import-item-quantity-unit-${index}`}
                      value={item.quantityUnit ?? ""}
                      onChange={(event) =>
                        updateItem(index, "quantityUnit", event.target.value)
                      }
                    />
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor={`import-item-price-${index}`}>
                      Unit price
                    </FieldLabel>
                    <Input
                      id={`import-item-price-${index}`}
                      type="number"
                      min="0"
                      step="any"
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItem(index, "unitPrice", event.target.value)
                      }
                    />
                  </Field>
                  <div className="flex items-end gap-2 md:col-span-2">
                    <Field className="min-w-0 flex-1">
                      <FieldLabel htmlFor={`import-item-pricing-unit-${index}`}>
                        Pricing unit
                      </FieldLabel>
                      <Input
                        id={`import-item-pricing-unit-${index}`}
                        value={item.pricingUnit ?? ""}
                        onChange={(event) =>
                          updateItem(index, "pricingUnit", event.target.value)
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove line item ${index + 1}`}
                      onClick={() => removeItem(index)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Tabs defaultValue="text">
            <TabsList>
              <TabsTrigger value="text">
                <SparklesIcon /> Paste text
              </TabsTrigger>
              <TabsTrigger value="json">
                <FileJsonIcon /> Upload JSON
              </TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="grid gap-3 pt-3">
              <Field>
                <FieldLabel htmlFor="contract-source-text">
                  Contract text
                </FieldLabel>
                <Textarea
                  id="contract-source-text"
                  className="min-h-52 font-mono text-sm"
                  placeholder="Paste the purchase order or contract text here..."
                  value={contractText}
                  onChange={(event) => setContractText(event.target.value)}
                />
              </Field>
              <Button
                type="button"
                className="justify-self-start"
                disabled={contractText.trim().length < 20 || extract.isPending}
                onClick={() => void handleExtract()}
              >
                <SparklesIcon />
                {extract.isPending ? "Extracting..." : "Extract contract"}
              </Button>
            </TabsContent>
            <TabsContent value="json" className="pt-3">
              <Field>
                <FieldLabel htmlFor="contract-json-file">JSON file</FieldLabel>
                <Input
                  id="contract-json-file"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) =>
                    void handleJsonFile(event.target.files?.[0])
                  }
                />
              </Field>
            </TabsContent>
          </Tabs>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {proposal ? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Reject
            </Button>
            <Button
              type="button"
              disabled={importDraft.isPending}
              onClick={() => void handleAccept()}
            >
              {importDraft.isPending ? "Creating..." : "Accept and create"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
