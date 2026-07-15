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
  parseContractJsonFile,
} from "@/lib/contracts/contract-proposal";
import { useTRPC } from "@/trpc/client";

const MAX_JSON_FILE_BYTES = 10_000_000;

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
  const [extractionReceipt, setExtractionReceipt] = useState<string | null>(
    null,
  );
  const [proposals, setProposals] = useState<ContractProposal[]>([]);
  const [proposalIndex, setProposalIndex] = useState(0);
  const [itemKeysByProposal, setItemKeysByProposal] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const extract = useMutation(trpc.contract.extract.mutationOptions());
  const importDraft = useMutation(trpc.contract.importDraft.mutationOptions());
  const importDrafts = useMutation(
    trpc.contract.importDrafts.mutationOptions(),
  );
  const proposal = proposals[proposalIndex] ?? null;
  const itemKeys = itemKeysByProposal[proposalIndex] ?? [];

  function reset() {
    setContractText("");
    setExtractionReceipt(null);
    setProposals([]);
    setProposalIndex(0);
    setItemKeysByProposal([]);
    setError(null);
  }

  function loadProposals(values: ContractProposal[]) {
    setProposals(values);
    setProposalIndex(0);
    setItemKeysByProposal(
      values.map((value) => value.items.map(createItemKey)),
    );
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
      setExtractionReceipt(extracted.extractionReceipt);
      loadProposals([
        {
          ...extracted.proposal,
          contract: {
            ...extracted.proposal.contract,
            poDate: new Date(extracted.proposal.contract.poDate),
            paymentTerms: extracted.proposal.contract.paymentTerms ?? undefined,
            deliveryTerms:
              extracted.proposal.contract.deliveryTerms ?? undefined,
          },
          items: extracted.proposal.items.map((item) => ({
            ...item,
            quantityUnit: item.quantityUnit ?? undefined,
            pricingUnit: item.pricingUnit ?? undefined,
          })),
        },
      ]);
    } catch (extractError) {
      setError(getMutationErrorMessage(extractError));
    }
  }

  async function handleJsonFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const isJsonMime = file.type === "" || file.type === "application/json";
    if (!file.name.toLowerCase().endsWith(".json") || !isJsonMime) {
      setError("Choose a .json file.");
      return;
    }
    if (file.size > MAX_JSON_FILE_BYTES) {
      setError("JSON files must be 10 MB or smaller.");
      return;
    }
    try {
      const parsed = parseContractJsonFile(
        JSON.parse(await readJsonFile(file)),
      );
      setExtractionReceipt(null);
      loadProposals(parsed);
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
    setProposals((current) =>
      current.map((entry, index) =>
        index === proposalIndex
          ? {
              ...entry,
              contract: {
                ...entry.contract,
                [field]:
                  field === "poDate"
                    ? new Date(`${value}T00:00:00.000Z`)
                    : value,
              },
            }
          : entry,
      ),
    );
  }

  function updateItem(
    index: number,
    field: keyof ContractProposal["items"][number],
    value: string,
  ) {
    setProposals((current) =>
      current.map((entry, entryIndex) => {
        if (entryIndex !== proposalIndex) return entry;
        const items = [...entry.items];
        const item = items[index];
        if (!item) return entry;
        items[index] = {
          ...item,
          [field]:
            field === "quantity" || field === "unitPrice"
              ? Number(value)
              : value,
        };
        return { ...entry, items };
      }),
    );
  }

  function addItem() {
    setProposals((current) =>
      current.map((entry, index) =>
        index === proposalIndex
          ? {
              ...entry,
              items: [
                ...entry.items,
                {
                  description: "",
                  quantity: 1,
                  quantityUnit: undefined,
                  unitPrice: 0,
                  pricingUnit: undefined,
                },
              ],
            }
          : entry,
      ),
    );
    setItemKeysByProposal((current) =>
      current.map((keys, index) =>
        index === proposalIndex ? [...keys, createItemKey()] : keys,
      ),
    );
  }

  function removeItem(index: number) {
    setProposals((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === proposalIndex
          ? {
              ...entry,
              items: entry.items.filter((_, itemIndex) => itemIndex !== index),
            }
          : entry,
      ),
    );
    setItemKeysByProposal((current) =>
      current.map((keys, entryIndex) =>
        entryIndex === proposalIndex
          ? keys.filter((_, itemIndex) => itemIndex !== index)
          : keys,
      ),
    );
  }

  async function handleAccept() {
    if (!proposal) return;
    setError(null);
    const parsed = contractProposalSchema.array().min(1).safeParse(proposals);
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Please review the contract values.",
      );
      return;
    }
    const firstProposal = parsed.data[0];
    if (!firstProposal) return;

    try {
      const created =
        parsed.data.length === 1
          ? await importDraft.mutateAsync({
              organisationId,
              ...(extractionReceipt ? { extractionReceipt } : {}),
              proposal: firstProposal,
            })
          : await importDrafts.mutateAsync({
              organisationId,
              proposals: parsed.data,
            });
      await Promise.all([
        queryClient.invalidateQueries(
          trpc.contract.list.queryFilter({ organisationId }),
        ),
        queryClient.invalidateQueries(
          trpc.audit.list.queryFilter({ organisationId }),
        ),
      ]);
      toast.success(
        parsed.data.length === 1
          ? "Contract draft imported"
          : `${parsed.data.length} contract drafts imported`,
      );
      handleOpenChange(false);
      router.push(
        parsed.data.length === 1 && "id" in created
          ? `/org/${organisationId}/contracts/${created.id}`
          : `/org/${organisationId}/contracts`,
      );
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
            {proposals.length > 1 ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <p className="font-medium">
                  Contract {proposalIndex + 1} of {proposals.length}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={proposalIndex === 0}
                    onClick={() => setProposalIndex((index) => index - 1)}
                  >
                    Previous contract
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={proposalIndex === proposals.length - 1}
                    onClick={() => setProposalIndex((index) => index + 1)}
                  >
                    Next contract
                  </Button>
                </div>
              </div>
            ) : null}
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
              disabled={importDraft.isPending || importDrafts.isPending}
              onClick={() => void handleAccept()}
            >
              {importDraft.isPending || importDrafts.isPending
                ? "Creating..."
                : proposals.length > 1
                  ? `Accept and create ${proposals.length}`
                  : "Accept and create"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
