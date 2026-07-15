"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  FileCheck2Icon,
  LightbulbIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";

type SheetRole = "ORGANIZATIONS" | "LINE_ITEMS" | "SUMMARY" | "OTHER";
type SheetMapping = {
  name: string;
  role: SheetRole;
  headerRow: number | null;
  headers: string[];
  mapping: Record<string, number>;
  missingRequired: string[];
};
type MappingAnalysis = {
  sheets: SheetMapping[];
  sourceOrganisations: Array<{
    id: string;
    name: string | null;
    contractCount: number;
    lineItemCount: number;
  }>;
  requiresAssistance: boolean;
};
type CellPatch = {
  sheet: string;
  row: number;
  column: number;
  value: string | number | boolean | null;
};
type ValidationError = {
  sheet: string;
  row: number;
  column: number;
  field: string;
  code: string;
  message: string;
};
type Suggestion = {
  sheetName: string;
  field: string;
  columnIndex: number;
  confidence: number;
  rationale: string;
};

const roleLabels: Record<SheetRole, string> = {
  ORGANIZATIONS: "Organisations",
  LINE_ITEMS: "Line items",
  SUMMARY: "Contract summary",
  OTHER: "Reference / other",
};
const fieldsByRole: Record<SheetRole, string[]> = {
  ORGANIZATIONS: ["sourceOrganisationId", "organisationName", "region"],
  LINE_ITEMS: [
    "workbookItemId",
    "poRefNo",
    "description",
    "quantity",
    "quantityUnit",
    "unitPrice",
    "pricingUnit",
    "total",
  ],
  SUMMARY: [
    "sourceOrganisationId",
    "clientName",
    "poRefNo",
    "poDate",
    "paymentTerms",
    "deliveryTerms",
    "status",
    "itemCount",
    "total",
  ],
  OTHER: [],
};
const previewSkeletonRows = [
  "preview-one",
  "preview-two",
  "preview-three",
  "preview-four",
  "preview-five",
  "preview-six",
  "preview-seven",
  "preview-eight",
];

function asMapping(value: unknown): MappingAnalysis {
  const candidate = value as Partial<MappingAnalysis> | null;
  return {
    sheets: Array.isArray(candidate?.sheets) ? candidate.sheets : [],
    sourceOrganisations: Array.isArray(candidate?.sourceOrganisations)
      ? candidate.sourceOrganisations
      : [],
    requiresAssistance: Boolean(candidate?.requiresAssistance),
  };
}

function asErrors(value: unknown): ValidationError[] {
  return Array.isArray(value) ? (value as ValidationError[]) : [];
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function headerOptions(headers: string[]) {
  return headers.map((header, column) => ({
    id: `${column + 1}-${header}`,
    column,
    header,
  }));
}

function PreviewSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading sheet preview"
      className="space-y-2 p-4"
    >
      {previewSkeletonRows.map((row) => (
        <Skeleton key={row} className="h-9 w-full" />
      ))}
    </div>
  );
}

function SheetPreview({
  organisationId,
  importId,
  sheet,
  offset,
  patches,
  discarded,
  disabled,
  onOffset,
  onPatch,
  onDiscard,
}: {
  organisationId: string;
  importId: string;
  sheet: SheetMapping;
  offset: number;
  patches: CellPatch[];
  discarded: Set<number>;
  disabled: boolean;
  onOffset: (offset: number) => void;
  onPatch: (patch: CellPatch) => void;
  onDiscard: (row: number) => void;
}) {
  const trpc = useTRPC();
  const parentRef = useRef<HTMLDivElement>(null);
  const { data } = useSuspenseQuery(
    trpc.tradebookImport.previewSheet.queryOptions({
      organisationId,
      importId,
      sheetName: sheet.name,
      offset,
      limit: 100,
    }),
  );
  const virtualizer = useVirtualizer({
    count: data.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 8,
  });
  const columnCount = Math.max(
    data.sheet.columnCount,
    ...data.rows.map((row) => row.values.length),
  );
  const columns = Array.from({ length: columnCount }, (_, index) => index + 1);
  const canDiscard = sheet.role === "SUMMARY" || sheet.role === "LINE_ITEMS";
  const headerRow = sheet.headerRow ?? 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4">
        <p className="text-xs text-muted-foreground">
          Rows {offset + 1}–
          {Math.min(offset + data.rows.length, data.sheet.rowCount)} of{" "}
          {data.sheet.rowCount}
          {data.sheet.footerRows.length > 0
            ? ` · ${data.sheet.footerRows.length} footer row excluded`
            : ""}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => onOffset(Math.max(0, offset - 100))}
          >
            Previous rows
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.nextOffset === null}
            onClick={() =>
              data.nextOffset !== null && onOffset(data.nextOffset)
            }
          >
            Next rows
          </Button>
        </div>
      </div>
      <section
        ref={parentRef}
        className="relative h-[32rem] overflow-auto border-y bg-muted/10"
        aria-label={`${sheet.name} virtualized rows`}
      >
        <div
          className="relative min-w-max"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = data.rows[virtualRow.index];
            if (!row) return null;
            const isHeader = row.rowNumber === headerRow;
            const isFooter = data.sheet.footerRows.includes(row.rowNumber);
            const isDiscarded = discarded.has(row.rowNumber);
            return (
              <div
                key={row.rowNumber}
                className={cn(
                  "absolute left-0 top-0 grid min-w-full border-b bg-card text-xs",
                  isHeader && "sticky z-10 bg-muted font-semibold",
                  isFooter &&
                    "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
                  isDiscarded && "bg-destructive/5 opacity-55 line-through",
                )}
                style={{
                  width: "max-content",
                  minWidth: "100%",
                  gridTemplateColumns: `3.75rem repeat(${columnCount}, minmax(9rem, 1fr)) ${canDiscard ? "5rem" : ""}`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="sticky left-0 z-10 border-r bg-inherit px-2 py-2 font-mono text-muted-foreground">
                  {row.rowNumber}
                </div>
                {columns.map((columnNumber) => {
                  const columnIndex = columnNumber - 1;
                  const patch = patches.find(
                    (entry) =>
                      entry.sheet === sheet.name &&
                      entry.row === row.rowNumber &&
                      entry.column === columnIndex + 1,
                  );
                  const value = patch?.value ?? row.values[columnIndex];
                  return (
                    <div key={columnNumber} className="border-r px-1 py-1">
                      {isHeader || isFooter || disabled ? (
                        <span
                          className="block truncate px-1 py-1.5"
                          title={displayValue(value)}
                        >
                          {displayValue(value) || "—"}
                        </span>
                      ) : (
                        <Input
                          aria-label={`${sheet.name} row ${row.rowNumber} column ${columnIndex + 1}`}
                          className="h-7 min-w-32 border-transparent bg-transparent px-1.5 shadow-none focus-visible:bg-background"
                          value={displayValue(value)}
                          onChange={(event) =>
                            onPatch({
                              sheet: sheet.name,
                              row: row.rowNumber,
                              column: columnIndex + 1,
                              value: event.target.value,
                            })
                          }
                        />
                      )}
                    </div>
                  );
                })}
                {canDiscard ? (
                  <div className="flex items-center justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={disabled || isHeader || isFooter}
                      aria-label={`${isDiscarded ? "Restore" : "Discard"} row ${row.rowNumber}`}
                      onClick={() => onDiscard(row.rowNumber)}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function TradebookReviewWorkspace({
  organisationId,
  importId,
}: {
  organisationId: string;
  importId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    trpc.tradebookImport.get.queryOptions({ organisationId, importId }),
  );
  const initialMapping = asMapping(data.mapping);
  const [sheets, setSheets] = useState(initialMapping.sheets);
  const [activeSheet, setActiveSheet] = useState(
    initialMapping.sheets[0]?.name ?? "",
  );
  const [offset, setOffset] = useState(0);
  const [selectedSourceOrganisationId, setSelectedSourceOrganisationId] =
    useState(
      data.selectedSourceOrganisationId ??
        initialMapping.sourceOrganisations[0]?.id ??
        "",
    );
  const [patches, setPatches] = useState<CellPatch[]>(data.review.patches);
  const [discardedContractRows, setDiscardedContractRows] = useState<number[]>(
    data.review.discardedContractRows,
  );
  const [discardedLineItemRows, setDiscardedLineItemRows] = useState<number[]>(
    data.review.discardedLineItemRows,
  );
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    asErrors(data.validationErrors),
  );
  const [readyToImport, setReadyToImport] = useState(data.status === "MAPPED");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(
    null,
  );
  const saveReview = useMutation(
    trpc.tradebookImport.saveReview.mutationOptions(),
  );
  const suggestMapping = useMutation(
    trpc.tradebookImport.suggestMapping.mutationOptions(),
  );
  const commit = useMutation(trpc.tradebookImport.commit.mutationOptions());
  const selectedSheet = sheets.find((sheet) => sheet.name === activeSheet);
  const imported = data.status === "IMPORTED" || commit.isSuccess;
  const failed = data.status === "FAILED";

  function updatePatch(next: CellPatch) {
    setReadyToImport(false);
    setPatches((current) => [
      ...current.filter(
        (patch) =>
          patch.sheet !== next.sheet ||
          patch.row !== next.row ||
          patch.column !== next.column,
      ),
      next,
    ]);
  }

  function toggleDiscard(role: SheetRole, row: number) {
    setReadyToImport(false);
    const update = (current: number[]) =>
      current.includes(row)
        ? current.filter((entry) => entry !== row)
        : [...current, row];
    if (role === "SUMMARY") setDiscardedContractRows(update);
    if (role === "LINE_ITEMS") setDiscardedLineItemRows(update);
  }

  async function handleSuggest() {
    try {
      const result = await suggestMapping.mutateAsync({
        organisationId,
        importId,
      });
      if (!result.available) {
        setSuggestionMessage(result.reason);
        return;
      }
      setSuggestions(result.suggestions);
      setSuggestionMessage(
        result.suggestions.length === 0
          ? "Deterministic mapping already covered every required field."
          : "Review each suggestion before applying it.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Mapping suggestions failed",
      );
    }
  }

  function applySuggestion(suggestion: Suggestion) {
    setSheets((current) =>
      current.map((sheet) =>
        sheet.name === suggestion.sheetName
          ? {
              ...sheet,
              mapping: {
                ...sheet.mapping,
                [suggestion.field]: suggestion.columnIndex,
              },
              missingRequired: sheet.missingRequired.filter(
                (field) => field !== suggestion.field,
              ),
            }
          : sheet,
      ),
    );
    setSuggestions((current) =>
      current.filter((entry) => entry !== suggestion),
    );
    setReadyToImport(false);
  }

  async function handleSave() {
    try {
      const result = await saveReview.mutateAsync({
        organisationId,
        importId,
        selectedSourceOrganisationId,
        sheets: sheets.map(
          ({ headers: _, missingRequired: __, ...sheet }) => sheet,
        ),
        patches,
        discardedContractRows,
        discardedLineItemRows,
      });
      setValidationErrors(result.validationErrors);
      setReadyToImport(result.readyToImport);
      await queryClient.invalidateQueries(
        trpc.tradebookImport.get.queryFilter({ organisationId, importId }),
      );
      toast[result.readyToImport ? "success" : "error"](
        result.readyToImport
          ? `${result.contractCount} contracts and ${result.lineItemCount} line items are ready`
          : `${result.validationErrors.length} validation issues remain`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Review could not be saved",
      );
    }
  }

  async function handleCommit() {
    try {
      const result = await commit.mutateAsync({ organisationId, importId });
      await Promise.all([
        queryClient.invalidateQueries(
          trpc.tradebookImport.list.queryFilter({ organisationId }),
        ),
        queryClient.invalidateQueries(
          trpc.contract.list.queryFilter({ organisationId }),
        ),
        queryClient.invalidateQueries(
          trpc.lineItem.list.queryFilter({ organisationId }),
        ),
        queryClient.invalidateQueries(
          trpc.audit.list.queryFilter({ organisationId }),
        ),
      ]);
      toast.success(
        `Imported ${result.contractCount} contracts and ${result.lineItemCount} line items`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Import could not be committed",
      );
    }
  }

  if (imported) {
    const result = commit.data;
    return (
      <section className="mx-auto max-w-3xl space-y-4 py-8">
        <Card className="bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_45%)]">
          <CardHeader>
            <div className="mb-2 w-fit rounded-full border bg-background p-3 text-primary">
              <CheckCircle2Icon aria-hidden="true" className="size-6" />
            </div>
            <CardTitle className="text-2xl">Tradebook imported</CardTitle>
            <CardDescription>
              {result?.contractCount ?? data.importedContractCount} contracts
              and {result?.lineItemCount ?? data.importedLineItemCount} line
              items were created atomically.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button render={<Link href={`/org/${organisationId}/contracts`} />}>
              View contracts
            </Button>
            <Button
              variant="outline"
              render={<Link href={`/org/${organisationId}/line-items`} />}
            >
              View line items
            </Button>
            <Button
              variant="outline"
              render={<Link href={`/org/${organisationId}/audit-trail`} />}
            >
              View audit trail
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-labelledby="review-title" className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button
            variant="link"
            className="-ml-2 px-2 text-muted-foreground"
            render={<Link href={`/org/${organisationId}/imports`} />}
          >
            <ArrowLeftIcon aria-hidden="true" /> Import history
          </Button>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Review station
          </p>
          <h2
            id="review-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {data.fileName ?? "Tradebook review"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {data.formulaCount.toLocaleString()} formulas preserved ·{" "}
            {(data.fileSizeBytes ?? 0).toLocaleString()} bytes
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={
              failed || saveReview.isPending || !selectedSourceOrganisationId
            }
          >
            <SaveIcon aria-hidden="true" />
            {saveReview.isPending ? "Validating..." : "Save and validate"}
          </Button>
          <Button
            onClick={handleCommit}
            disabled={!readyToImport || commit.isPending}
          >
            <FileCheck2Icon aria-hidden="true" />
            {commit.isPending ? "Importing..." : "Commit import"}
          </Button>
        </div>
      </div>

      {failed ? (
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>Workbook preparation failed</AlertTitle>
          <AlertDescription>
            {data.failureMessage ??
              "Upload a corrected workbook from import history."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Sheet preview</CardTitle>
            <CardDescription>
              Edit source cells in place. Formula text remains preserved in the
              import snapshot.
            </CardDescription>
            <div
              className="mt-3 flex gap-1 overflow-x-auto pb-1"
              role="tablist"
              aria-label="Workbook sheets"
            >
              {sheets.map((sheet) => (
                <Button
                  key={sheet.name}
                  type="button"
                  size="sm"
                  variant={activeSheet === sheet.name ? "secondary" : "ghost"}
                  role="tab"
                  aria-selected={activeSheet === sheet.name}
                  onClick={() => {
                    setActiveSheet(sheet.name);
                    setOffset(0);
                  }}
                >
                  {sheet.name}
                  <Badge variant="outline" className="ml-1">
                    {roleLabels[sheet.role]}
                  </Badge>
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {selectedSheet ? (
              <Suspense fallback={<PreviewSkeleton />}>
                <SheetPreview
                  organisationId={organisationId}
                  importId={importId}
                  sheet={selectedSheet}
                  offset={offset}
                  patches={patches}
                  discarded={
                    new Set(
                      selectedSheet.role === "SUMMARY"
                        ? discardedContractRows
                        : discardedLineItemRows,
                    )
                  }
                  disabled={failed}
                  onOffset={setOffset}
                  onPatch={updatePatch}
                  onDiscard={(row) => toggleDiscard(selectedSheet.role, row)}
                />
              </Suspense>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                No parsed sheets are available.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import partition</CardTitle>
              <CardDescription>
                Only one workbook organisation is persisted into this app
                organisation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NativeSelect
                aria-label="Workbook organisation"
                value={selectedSourceOrganisationId}
                disabled={failed}
                onChange={(event) => {
                  setSelectedSourceOrganisationId(event.target.value);
                  setReadyToImport(false);
                }}
              >
                <NativeSelectOption value="">
                  Select source organisation
                </NativeSelectOption>
                {initialMapping.sourceOrganisations.map((source) => (
                  <NativeSelectOption key={source.id} value={source.id}>
                    {source.id} · {source.contractCount} contracts ·{" "}
                    {source.lineItemCount} lines
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sheet mappings</CardTitle>
              <CardDescription>
                Deterministic aliases run first. AI only suggests missing
                fields.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sheets.map((sheet) => (
                <div key={sheet.name} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{sheet.name}</p>
                    <Badge variant="outline">{roleLabels[sheet.role]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Header row {sheet.headerRow ?? "not detected"} ·{" "}
                    {Object.keys(sheet.mapping).length} mapped fields
                  </p>
                  {sheet.missingRequired.length > 0 ? (
                    <p className="mt-2 text-xs text-destructive">
                      Missing: {sheet.missingRequired.join(", ")}
                    </p>
                  ) : null}
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Manual column mapping
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <NativeSelect
                        aria-label={`${sheet.name} sheet role`}
                        value={sheet.role}
                        disabled={failed}
                        onChange={(event) => {
                          const role = event.target.value as SheetRole;
                          setSheets((current) =>
                            current.map((entry) =>
                              entry.name === sheet.name
                                ? { ...entry, role, mapping: {} }
                                : entry,
                            ),
                          );
                          setReadyToImport(false);
                        }}
                      >
                        {(Object.keys(roleLabels) as SheetRole[]).map(
                          (role) => (
                            <NativeSelectOption key={role} value={role}>
                              {roleLabels[role]}
                            </NativeSelectOption>
                          ),
                        )}
                      </NativeSelect>
                      <Input
                        type="number"
                        min={1}
                        aria-label={`${sheet.name} header row`}
                        value={sheet.headerRow ?? ""}
                        disabled={failed}
                        placeholder="Header row"
                        onChange={(event) => {
                          const headerRow = Number(event.target.value);
                          setSheets((current) =>
                            current.map((entry) =>
                              entry.name === sheet.name
                                ? {
                                    ...entry,
                                    headerRow:
                                      Number.isInteger(headerRow) &&
                                      headerRow > 0
                                        ? headerRow
                                        : null,
                                  }
                                : entry,
                            ),
                          );
                          setReadyToImport(false);
                        }}
                      />
                    </div>
                    {fieldsByRole[sheet.role].map((field) => (
                      <div
                        key={field}
                        className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2 text-xs"
                      >
                        <span className="truncate font-mono" title={field}>
                          {field}
                        </span>
                        <NativeSelect
                          aria-label={`${sheet.name} ${field} column`}
                          value={
                            sheet.mapping[field] === undefined
                              ? ""
                              : String(sheet.mapping[field])
                          }
                          disabled={failed}
                          onChange={(event) => {
                            const nextMapping = { ...sheet.mapping };
                            if (event.target.value === "") {
                              delete nextMapping[field];
                            } else {
                              nextMapping[field] = Number(event.target.value);
                            }
                            setSheets((current) =>
                              current.map((entry) =>
                                entry.name === sheet.name
                                  ? { ...entry, mapping: nextMapping }
                                  : entry,
                              ),
                            );
                            setReadyToImport(false);
                          }}
                        >
                          <NativeSelectOption value="">
                            Not mapped
                          </NativeSelectOption>
                          {headerOptions(sheet.headers).map((option) => (
                            <NativeSelectOption
                              key={option.id}
                              value={String(option.column)}
                            >
                              {option.column + 1}. {option.header || "Untitled"}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={suggestMapping.isPending || failed}
                onClick={handleSuggest}
              >
                <SparklesIcon aria-hidden="true" />
                {suggestMapping.isPending
                  ? "Requesting suggestions..."
                  : "Suggest missing mappings"}
              </Button>
              {suggestionMessage ? (
                <p className="text-xs text-muted-foreground">
                  {suggestionMessage}
                </p>
              ) : null}
              {suggestions.map((suggestion) => (
                <div
                  key={`${suggestion.sheetName}-${suggestion.field}`}
                  className="rounded-lg border border-dashed p-3"
                >
                  <p className="flex items-center gap-1.5 font-medium">
                    <LightbulbIcon aria-hidden="true" className="size-3.5" />
                    {suggestion.field}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {suggestion.sheetName}, column {suggestion.columnIndex + 1}{" "}
                    · {Math.round(suggestion.confidence * 100)}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {suggestion.rationale}
                  </p>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => applySuggestion(suggestion)}
                  >
                    Apply suggestion
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Validation</CardTitle>
              <CardDescription>
                {validationErrors.length === 0
                  ? "No blocking issues in the saved review."
                  : `${validationErrors.length} blocking issues require edits or discards.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-72 space-y-2 overflow-auto">
              {validationErrors.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2Icon aria-hidden="true" className="size-4" />{" "}
                  Ready after validation
                </div>
              ) : (
                validationErrors.slice(0, 100).map((error) => (
                  <button
                    key={`${error.sheet}-${error.row}-${error.column}-${error.field}-${error.code}`}
                    type="button"
                    className="block w-full rounded-lg border p-2 text-left text-xs hover:bg-muted"
                    onClick={() => {
                      setActiveSheet(error.sheet);
                      setOffset(Math.floor((error.row - 1) / 100) * 100);
                    }}
                  >
                    <span className="font-mono text-destructive">
                      {error.sheet}!R{error.row}C{error.column}
                    </span>
                    <span className="mt-1 block">{error.message}</span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
