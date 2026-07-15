"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
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
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useLiveWorkbookPreview } from "@/components/imports/use-live-workbook-preview";
import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  filterSheetRowsForOrganisation,
  type ClientWorkbookData,
} from "@/lib/tradebook/client-preview";
import {
  formatMoneyDisplay,
} from "@/lib/tradebook/money";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";

type SheetRole = "ORGANIZATIONS" | "LINE_ITEMS" | "SUMMARY" | "OTHER";
type SheetMapping = {
  name: string;
  role: SheetRole;
  headerRow: number | null;
  headers: string[];
  mapping: Record<string, number>;
  headerMatches?: Record<
    string,
    {
      columnIndex: number;
      matchType: "EXACT_ALIAS" | "FUZZY_ALIAS";
      matchedHeader: string;
      matchedAlias: string;
      score: number;
    }
  >;
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
  aiAssistance?: {
    autoRunCompleted: boolean;
    suggestions: Suggestion[];
    lastRunAt: string | null;
  };
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

type MappingRow = {
  key: string;
  sheetName: string;
  role: SheetRole;
  field: string;
  mappingColumn: number | undefined;
  missing: boolean;
  aiSuggestion: Suggestion | undefined;
  aiSuggested: boolean;
  inlineError: string | null;
};

const PATCH_DEBOUNCE_MS = 400;

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
const requiredFieldsByRole: Record<SheetRole, string[]> = {
  ORGANIZATIONS: ["sourceOrganisationId", "organisationName"],
  LINE_ITEMS: ["workbookItemId", "poRefNo", "description", "quantity", "unitPrice"],
  SUMMARY: ["sourceOrganisationId", "clientName", "poRefNo", "poDate"],
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
    aiAssistance:
      candidate?.aiAssistance &&
        typeof candidate.aiAssistance === "object" &&
        Array.isArray(candidate.aiAssistance.suggestions)
        ? {
          autoRunCompleted: Boolean(candidate.aiAssistance.autoRunCompleted),
          suggestions: candidate.aiAssistance.suggestions as Suggestion[],
          lastRunAt:
            typeof candidate.aiAssistance.lastRunAt === "string"
              ? candidate.aiAssistance.lastRunAt
              : null,
        }
        : undefined,
  };
}

function asErrors(value: unknown): ValidationError[] {
  return Array.isArray(value) ? (value as ValidationError[]) : [];
}

function displayValue(value: unknown, money = false) {
  if (money) return formatMoneyDisplay(value);
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

function moneyFieldSet(role: SheetRole, mapping: Record<string, number>) {
  const fields =
    role === "LINE_ITEMS"
      ? ["quantity", "unitPrice", "total"]
      : role === "SUMMARY"
        ? ["total"]
        : [];
  return new Set(
    fields
      .map((field) => mapping[field])
      .filter((column): column is number => column !== undefined),
  );
}

function SheetPreview({
  workbook,
  allMappings,
  selectedSourceOrganisationId,
  sheet,
  discarded,
  disabled,
  validationErrors,
  isRecalculating,
  onPatch,
  onDiscard,
}: {
  workbook: ClientWorkbookData;
  allMappings: Array<{
    name: string;
    role: SheetRole;
    headerRow: number | null;
    mapping: Record<string, number>;
  }>;
  selectedSourceOrganisationId: string;
  sheet: SheetMapping;
  discarded: Set<number>;
  disabled: boolean;
  validationErrors: ValidationError[];
  isRecalculating: boolean;
  onPatch: (patch: CellPatch) => void;
  onDiscard: (row: number) => void;
}) {
  const patchTimersRef = useRef<Map<string, number>>(new Map());
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const sheetSnapshot = workbook.sheets.find((entry) => entry.name === sheet.name);
  const rows = useMemo(() => {
    if (!sheetSnapshot) return [];
    return filterSheetRowsForOrganisation(
      sheetSnapshot,
      {
        name: sheet.name,
        role: sheet.role,
        headerRow: sheet.headerRow,
        mapping: sheet.mapping,
      },
      selectedSourceOrganisationId || undefined,
      workbook.sheets,
      allMappings,
    );
  }, [
    allMappings,
    selectedSourceOrganisationId,
    sheet.headerRow,
    sheet.mapping,
    sheet.name,
    sheet.role,
    sheetSnapshot,
    workbook.sheets,
  ]);

  const columnCount = Math.max(
    sheetSnapshot?.columnCount ?? 0,
    ...rows.map((row) => row.values.length),
    1,
  );
  const columns = Array.from({ length: columnCount }, (_, index) => index + 1);
  const canDiscard = sheet.role === "SUMMARY" || sheet.role === "LINE_ITEMS";
  const headerRow = sheet.headerRow ?? 1;
  const footerRows = new Set(sheetSnapshot?.footerRows ?? []);
  const moneyColumns = moneyFieldSet(sheet.role, sheet.mapping);

  useEffect(() => {
    setDraftValues({});
    for (const timer of patchTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    patchTimersRef.current.clear();
  }, [sheet.name]);

  useEffect(() => {
    return () => {
      for (const timer of patchTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      patchTimersRef.current.clear();
    };
  }, []);

  const flushPatch = useCallback(
    (row: number, column: number, value: string) => {
      onPatch({
        sheet: sheet.name,
        row,
        column,
        value,
      });
    },
    [onPatch, sheet.name],
  );

  const handleCellChange = useCallback(
    (row: number, column: number, value: string) => {
      const key = `${row}:${column}`;
      setDraftValues((current) => ({ ...current, [key]: value }));

      const existing = patchTimersRef.current.get(key);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        flushPatch(row, column, value);
      }, PATCH_DEBOUNCE_MS);

      patchTimersRef.current.set(key, timer);
    },
    [flushPatch],
  );

  const handleCellBlur = useCallback(
    (row: number, column: number, value: string) => {
      const key = `${row}:${column}`;
      const existing = patchTimersRef.current.get(key);
      if (existing) {
        window.clearTimeout(existing);
      }
      patchTimersRef.current.delete(key);
      flushPatch(row, column, value);
      setDraftValues((current) => {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    [flushPatch],
  );

  const rowValidation = useMemo(() => {
    const byRow = new Map<number, ValidationError[]>();
    const byCell = new Map<string, ValidationError[]>();
    for (const error of validationErrors) {
      if (error.sheet !== sheet.name) continue;
      byRow.set(error.row, [...(byRow.get(error.row) ?? []), error]);
      byCell.set(
        `${error.row}:${error.column}`,
        [...(byCell.get(`${error.row}:${error.column}`) ?? []), error],
      );
    }
    return { byRow, byCell };
  }, [validationErrors, sheet.name]);

  if (!sheetSnapshot) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Sheet was not found in the workbook snapshot.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4">
        <p className="text-xs text-muted-foreground">
          {rows.length.toLocaleString()} rows loaded in browser
          {sheetSnapshot.footerRows.length > 0
            ? ` · ${sheetSnapshot.footerRows.length} footer row(s)`
            : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {isRecalculating ? "Recalculating formulas..." : "Live workbook preview"}
        </p>
      </div>
      <section className="h-[32rem] overflow-auto border-y bg-muted/10">
        <Table className="table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-16" />
            {columns.map((columnNumber) => (
              <col key={columnNumber} className="w-44" />
            ))}
            {canDiscard ? <col className="w-16" /> : null}
          </colgroup>
          <TableBody>
            {rows.map((row) => {
              const isHeader = row.rowNumber === headerRow;
              const isFooter = footerRows.has(row.rowNumber);
              const isDiscarded = discarded.has(row.rowNumber);
              const rowIssues = rowValidation.byRow.get(row.rowNumber) ?? [];
              return (
                <TableRow
                  key={row.rowNumber}
                  className={cn(
                    "bg-card align-top",
                    isHeader && "bg-muted font-semibold",
                    isFooter &&
                    "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
                    isDiscarded && "bg-destructive/5 opacity-55 line-through",
                    rowIssues.length > 0 &&
                    !isHeader &&
                    !isFooter &&
                    "bg-destructive/10",
                  )}
                >
                  <TableCell
                    className={cn(
                      "sticky left-0 z-10 bg-inherit px-2 py-1.5 font-mono text-muted-foreground",
                      rowIssues.length > 0 &&
                      !isHeader &&
                      !isFooter &&
                      "text-destructive",
                    )}
                    title={
                      rowIssues.length > 0
                        ? rowIssues.map((issue) => issue.message).join("\n")
                        : undefined
                    }
                  >
                    {row.rowNumber}
                    {rowIssues.length > 0 ? ` (${rowIssues.length})` : ""}
                  </TableCell>
                  {columns.map((columnNumber) => {
                    const columnIndex = columnNumber - 1;
                    const cellIssues =
                      rowValidation.byCell.get(
                        `${row.rowNumber}:${columnIndex + 1}`,
                      ) ?? [];
                    const value = row.values[columnIndex];
                    const asMoney = moneyColumns.has(columnIndex);
                    const cellKey = `${row.rowNumber}:${columnIndex + 1}`;
                    const cellValue =
                      draftValues[cellKey] ?? displayValue(value, asMoney);
                    return (
                      <TableCell
                        key={columnNumber}
                        className={cn(
                          "px-1 py-1 align-top",
                          cellIssues.length > 0 &&
                          !isHeader &&
                          !isFooter &&
                          "bg-destructive/10",
                        )}
                        title={
                          cellIssues.length > 0
                            ? cellIssues.map((issue) => issue.message).join("\n")
                            : undefined
                        }
                      >
                        {isHeader || isFooter || disabled ? (
                          <span
                            className="block truncate px-1 py-1"
                            title={displayValue(value, asMoney)}
                          >
                            {displayValue(value, asMoney) || "—"}
                          </span>
                        ) : (
                          <Input
                            aria-label={`${sheet.name} row ${row.rowNumber} column ${columnIndex + 1}`}
                            aria-invalid={cellIssues.length > 0}
                            className="h-7 w-full border-transparent bg-transparent px-1.5 shadow-none focus-visible:bg-background"
                            value={cellValue}
                            onChange={(event) => {
                              handleCellChange(
                                row.rowNumber,
                                columnIndex + 1,
                                event.target.value,
                              );
                            }}
                            onBlur={(event) => {
                              handleCellBlur(
                                row.rowNumber,
                                columnIndex + 1,
                                event.target.value,
                              );
                            }}
                          />
                        )}
                      </TableCell>
                    );
                  })}
                  {canDiscard ? (
                    <TableCell className="py-1 text-center">
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
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
  const initialSourceOrganisationId =
    data.selectedSourceOrganisationId ??
    (initialMapping.sourceOrganisations.length === 1
      ? (initialMapping.sourceOrganisations[0]?.id ?? "")
      : "");
  const [sheets, setSheets] = useState(initialMapping.sheets);
  const [activeSheet, setActiveSheet] = useState(
    initialMapping.sheets[0]?.name ?? "",
  );
  const [selectedSourceOrganisationId, setSelectedSourceOrganisationId] =
    useState(initialSourceOrganisationId);
  const [patches, setPatches] = useState<CellPatch[]>(data.review.patches);
  const [discardedContractRows, setDiscardedContractRows] = useState<number[]>(
    data.review.discardedContractRows,
  );
  const [discardedLineItemRows, setDiscardedLineItemRows] = useState<number[]>(
    data.review.discardedLineItemRows,
  );
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    () => asErrors(data.validationErrors),
  );
  const [hasValidatedMapping, setHasValidatedMapping] = useState(
    data.status === "MAPPED" || asErrors(data.validationErrors).length > 0,
  );
  const [readyToImport, setReadyToImport] = useState(data.status === "MAPPED");
  const [suggestions, setSuggestions] = useState<Suggestion[]>(
    initialMapping.aiAssistance?.suggestions ?? [],
  );
  const [aiMappedRows, setAiMappedRows] = useState<string[]>([]);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(
    null,
  );
  const autoSuggestCompleted = Boolean(
    initialMapping.aiAssistance?.autoRunCompleted,
  );
  const [aiRunRecorded, setAiRunRecorded] = useState(autoSuggestCompleted);
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
  const { data: workbookPayload, isPending: workbookPending } = useQuery({
    ...trpc.tradebookImport.getWorkbookData.queryOptions({
      organisationId,
      importId,
    }),
    enabled: hasValidatedMapping && !failed && sheets.length > 0,
  });
  const baseWorkbook = useMemo<ClientWorkbookData | undefined>(() => {
    if (!workbookPayload) return undefined;
    return {
      sheets: workbookPayload.sheets,
      formulas: workbookPayload.formulas,
    };
  }, [workbookPayload]);
  const previewMappings = useMemo(
    () =>
      sheets.map((sheet) => ({
        name: sheet.name,
        role: sheet.role,
        headerRow: sheet.headerRow,
        mapping: sheet.mapping,
      })),
    [sheets],
  );
  const { liveData, isRecalculating } = useLiveWorkbookPreview({
    baseData: baseWorkbook,
    patches,
    mappings: previewMappings,
    discardedContractRows,
    discardedLineItemRows,
    enabled: hasValidatedMapping && Boolean(baseWorkbook),
  });
  const discardedRows = useMemo(() => {
    if (!selectedSheet) return new Set<number>();
    return new Set(
      selectedSheet.role === "SUMMARY"
        ? discardedContractRows
        : discardedLineItemRows,
    );
  }, [discardedContractRows, discardedLineItemRows, selectedSheet]);
  const suggestionLookup = useMemo(
    () =>
      new Map(
        suggestions.map((suggestion) => [
          `${suggestion.sheetName}:${suggestion.field}`,
          suggestion,
        ]),
      ),
    [suggestions],
  );
  const mappingRows = useMemo<MappingRow[]>(() => {
    return sheets.flatMap((sheet) =>
      fieldsByRole[sheet.role].map((field) => {
        const key = `${sheet.name}:${field}`;
        const missing =
          requiredFieldsByRole[sheet.role].includes(field) &&
          sheet.mapping[field] === undefined;
        const aiSuggestion = suggestionLookup.get(key);
        const matchType = sheet.headerMatches?.[field]?.matchType;
        const inlineError = missing
          ? "Required field is not mapped."
          : matchType === "FUZZY_ALIAS"
            ? "Header matched fuzzily. Verify this mapping."
            : null;
        return {
          key,
          sheetName: sheet.name,
          role: sheet.role,
          field,
          mappingColumn: sheet.mapping[field],
          missing,
          aiSuggestion,
          aiSuggested: aiMappedRows.includes(key) || Boolean(aiSuggestion),
          inlineError,
        };
      }),
    );
  }, [sheets, suggestionLookup, aiMappedRows]);
  const needsAutoSuggestion = useMemo(
    () =>
      sheets.some((sheet) => {
        if (sheet.role === "OTHER") return false;
        if (
          requiredFieldsByRole[sheet.role].some(
            (field) => sheet.mapping[field] === undefined,
          )
        ) {
          return true;
        }
        return requiredFieldsByRole[sheet.role].some(
          (field) => sheet.headerMatches?.[field]?.matchType === "FUZZY_ALIAS",
        );
      }),
    [sheets],
  );

  useOrganisationEvents({
    organisationId,
    entity: "upload",
    entityId: importId,
    onEvent: async () => {
      await Promise.all([
        queryClient.invalidateQueries(
          trpc.tradebookImport.get.queryFilter({ organisationId, importId }),
        ),
        queryClient.invalidateQueries(
          trpc.tradebookImport.list.queryFilter({ organisationId }),
        ),
      ]);
    },
  });

  useEffect(() => {
    if (initialMapping.sheets.length === 0) return;
    if (sheets.length > 0) return;

    setSheets(initialMapping.sheets);
    setActiveSheet((current) => current || initialMapping.sheets[0]?.name || "");
    setSuggestions(initialMapping.aiAssistance?.suggestions ?? []);
    setAiRunRecorded(Boolean(initialMapping.aiAssistance?.autoRunCompleted));
    if (!selectedSourceOrganisationId) {
      setSelectedSourceOrganisationId(initialSourceOrganisationId);
    }
  }, [
    initialMapping.aiAssistance?.autoRunCompleted,
    initialMapping.aiAssistance?.suggestions,
    initialMapping.sheets,
    initialSourceOrganisationId,
    selectedSourceOrganisationId,
    sheets.length,
  ]);

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

  const handleSuggest = useCallback(async (automatic = false) => {
    const runningToastId = automatic
      ? toast.loading(
        "Running AI mapping because some headers did not match exactly...",
      )
      : null;
    try {
      const result = await suggestMapping.mutateAsync({
        organisationId,
        importId,
      });
      if (!result.available) {
        setSuggestionMessage(result.reason);
        if (runningToastId !== null) {
          toast.error(result.reason, { id: runningToastId });
        }
        return;
      }
      setSuggestions(result.suggestions);
      setAiRunRecorded(true);
      setSuggestionMessage(
        result.suggestions.length === 0
          ? "Deterministic mapping already covered every required field."
          : automatic
            ? "AI suggestions were generated automatically. Review each row before applying."
            : "Review each suggestion before applying it.",
      );
      if (runningToastId !== null) {
        toast.success(
          result.suggestions.length === 0
            ? "AI mapping completed. No additional suggestions were required."
            : `AI mapping completed with ${result.suggestions.length} suggestion(s).`,
          { id: runningToastId },
        );
      }
    } catch (error) {
      if (runningToastId !== null) {
        toast.error("AI mapping failed.", { id: runningToastId });
      }
      toast.error(
        error instanceof Error ? error.message : "Mapping suggestions failed",
      );
    }
  }, [importId, organisationId, suggestMapping]);

  function applySuggestion(suggestion: Suggestion) {
    const suggestionKey = `${suggestion.sheetName}:${suggestion.field}`;
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
    setAiMappedRows((current) =>
      current.includes(suggestionKey) ? current : [...current, suggestionKey],
    );
    setSuggestions((current) =>
      current.filter(
        (entry) =>
          !(
            entry.sheetName === suggestion.sheetName &&
            entry.field === suggestion.field
          ),
      ),
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
      setHasValidatedMapping(true);
      await queryClient.invalidateQueries(
        trpc.tradebookImport.get.queryFilter({ organisationId, importId }),
      );
      await queryClient.invalidateQueries(
        trpc.tradebookImport.getWorkbookData.queryFilter({
          organisationId,
          importId,
        }),
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

  useEffect(() => {
    if (failed || suggestMapping.isPending || autoSuggestCompleted || aiRunRecorded) {
      return;
    }
    if (suggestions.length > 0) return;
    if (!needsAutoSuggestion) return;
    void handleSuggest(true);
  }, [
    aiRunRecorded,
    autoSuggestCompleted,
    failed,
    handleSuggest,
    needsAutoSuggestion,
    suggestions.length,
    suggestMapping.isPending,
  ]);

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
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/api/org/${organisationId}/export?format=excel`} />
              }
            >
              Export Excel
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/api/org/${organisationId}/export?format=json`} />
              }
            >
              Export JSON
            </Button>
            <Button
              nativeButton={false}
              render={<Link href={`/org/${organisationId}/contracts`} />}
            >
              View contracts
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/org/${organisationId}/line-items`} />}
            >
              View line items
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
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
      <div>
        <div>
          <Button
            variant="link"
            className="-ml-2 px-2 text-muted-foreground"
            nativeButton={false}
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
      {!failed && sheets.length === 0 ? (
        <Alert>
          <SparklesIcon aria-hidden="true" />
          <AlertTitle>Workbook is preparing</AlertTitle>
          <AlertDescription>
            Parsing is running in the background. Mappings and preview appear
            automatically once ready.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Import partition + Sheet mappings</CardTitle>
            <CardDescription>
              Pick one workbook organisation and map fields in a single grid.
              Row errors appear inline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <div className="max-h-[28rem] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sheet</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Header row</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Mapped column</TableHead>
                    <TableHead>AI</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappingRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        Workbook is still preparing. Mapping rows appear once
                        parsing finishes.
                      </TableCell>
                    </TableRow>
                  ) : (
                    mappingRows.map((row) => {
                      const sheet = sheets.find(
                        (entry) => entry.name === row.sheetName,
                      );
                      if (!sheet) return null;
                      return (
                        <TableRow
                          key={row.key}
                          className={cn(
                            row.aiSuggested &&
                            "bg-amber-50/80 dark:bg-amber-950/20",
                          )}
                        >
                          <TableCell className="font-medium">
                            {row.sheetName}
                          </TableCell>
                          <TableCell>
                            <NativeSelect
                              aria-label={`${row.sheetName} role`}
                              value={sheet.role}
                              disabled={failed}
                              onChange={(event) => {
                                const role = event.target.value as SheetRole;
                                setSheets((current) =>
                                  current.map((entry) =>
                                    entry.name === row.sheetName
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
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              aria-label={`${row.sheetName} header row`}
                              value={sheet.headerRow ?? ""}
                              disabled={failed}
                              className="h-8"
                              onChange={(event) => {
                                const headerRow = Number(event.target.value);
                                setSheets((current) =>
                                  current.map((entry) =>
                                    entry.name === row.sheetName
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
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.field}
                          </TableCell>
                          <TableCell>
                            <NativeSelect
                              aria-label={`${row.sheetName} ${row.field} column`}
                              value={
                                row.mappingColumn === undefined
                                  ? ""
                                  : String(row.mappingColumn)
                              }
                              disabled={failed}
                              onChange={(event) => {
                                const nextMapping = { ...sheet.mapping };
                                if (event.target.value === "") {
                                  delete nextMapping[row.field];
                                } else {
                                  nextMapping[row.field] = Number(
                                    event.target.value,
                                  );
                                }
                                setSheets((current) =>
                                  current.map((entry) =>
                                    entry.name === row.sheetName
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
                                  {option.column + 1}.{" "}
                                  {option.header || "Untitled"}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </TableCell>
                          <TableCell>
                            {row.aiSuggestion ? (
                              <div className="space-y-1">
                                <Badge variant="outline">
                                  {Math.round(row.aiSuggestion.confidence * 100)}
                                  %
                                </Badge>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="xs"
                                  onClick={() => {
                                    if (row.aiSuggestion) {
                                      applySuggestion(row.aiSuggestion);
                                    }
                                  }}
                                >
                                  <LightbulbIcon
                                    aria-hidden="true"
                                    className="size-3"
                                  />
                                  Apply
                                </Button>
                              </div>
                            ) : row.aiSuggested ? (
                              <Badge variant="outline">AI mapped</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-xs",
                              row.inlineError
                                ? "text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {row.inlineError ?? "OK"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={suggestMapping.isPending || failed}
              onClick={() => void handleSuggest()}
            >
              <SparklesIcon aria-hidden="true" />
              {suggestMapping.isPending
                ? "Requesting suggestions..."
                : "Suggest missing mappings"}
            </Button>
            {suggestionMessage ? (
              <p className="text-xs text-muted-foreground">{suggestionMessage}</p>
            ) : null}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSave}
              disabled={
                failed || saveReview.isPending || !selectedSourceOrganisationId
              }
            >
              <SaveIcon aria-hidden="true" />
              {saveReview.isPending ? "Validating..." : "Save and validate"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Sheet preview</CardTitle>
            <CardDescription>
              All rows load once in the browser. Edits and discards
              recalculate line totals, summary totals, and dashboard formulas
              live with 2-decimal truncation.
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
            {!hasValidatedMapping ? (
              <div className="p-6 text-sm text-muted-foreground">
                Validate mappings to unlock the Excel sheet preview.
              </div>
            ) : workbookPending || !liveData ? (
              <PreviewSkeleton />
            ) : selectedSheet ? (
              <Suspense fallback={<PreviewSkeleton />}>
                <SheetPreview
                  workbook={liveData}
                  allMappings={previewMappings}
                  selectedSourceOrganisationId={selectedSourceOrganisationId}
                  sheet={selectedSheet}
                  discarded={discardedRows}
                  disabled={failed}
                  validationErrors={validationErrors}
                  isRecalculating={isRecalculating}
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

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Validation</CardTitle>
              <CardDescription>
                {validationErrors.length === 0
                  ? "No blocking issues in the saved review."
                  : `${validationErrors.length} blocking issues require edits or discards.`}
              </CardDescription>
            </div>
            <Button
              onClick={handleCommit}
              disabled={!readyToImport || commit.isPending}
            >
              <FileCheck2Icon aria-hidden="true" />
              {commit.isPending ? "Importing..." : "Commit import"}
            </Button>
          </CardHeader>
          <CardContent className="max-h-72 space-y-2 overflow-auto">
            {validationErrors.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2Icon aria-hidden="true" className="size-4" />{" "}
                Ready after validation
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Validation issues are now shown directly on sheet rows and cells.
                Rows with issues are tinted red and show issue counts.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
