"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { type ReactNode, useState, useTransition } from "react";

import { DebouncedInput } from "@/components/filters/debounced-input";
import {
  auditSearchParams,
  getAuditListInput,
} from "@/components/operations/search-params";
import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
import {
  OperationsPagination,
  SortButton,
  TableBodyLoadingState,
  TableEmptyState,
  toggleSortDirection,
} from "@/components/operations/table-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTRPC } from "@/trpc/client";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
const label = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());

function JsonPanel({
  title,
  value,
  changed,
  tone = "neutral",
}: {
  title: string;
  value: unknown;
  changed: string[];
  tone?: "before" | "after" | "neutral";
}) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-lg border-l-4 bg-muted/20 p-3 ${
        tone === "before"
          ? "border-l-amber-500"
          : tone === "after"
            ? "border-l-emerald-500"
            : "border-l-border"
      }`}
    >
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {value ? (
        <pre className="max-h-80 overflow-auto overscroll-contain whitespace-pre-wrap break-words font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">No state recorded.</p>
      )}
      {changed.length ? (
        <p className="mt-3 break-words text-xs text-muted-foreground">
          Changed: {changed.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

type AuditEventRow = {
  id: string;
  actorClerkUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: "OWNER" | "ADMIN" | "MEMBER" | null;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  changedFields: string[];
  metadata?: unknown;
  contractId: string | null;
  lineItemId: string | null;
  uploadId: string | null;
  tradebookImportId: string | null;
  organisationUserId: string | null;
  invitationId: string | null;
  occurredAt: Date | string;
};

function DetailField({
  label: fieldLabel,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{fieldLabel}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function AuditEventSheet({
  organisationId,
  event,
  open,
  onOpenChange,
}: {
  organisationId: string;
  event: AuditEventRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!event) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-2xl lg:max-w-3xl">
        <SheetHeader className="shrink-0 border-b px-4 py-4 pr-12">
          <SheetTitle className="break-words pr-2">
            {label(event.action)} · {event.entityLabel ?? event.entityId}
          </SheetTitle>
          <SheetDescription className="break-words">
            {event.actorName ?? "Unknown user"} ·{" "}
            {dateTime.format(new Date(event.occurredAt))}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-4 p-4">
            <dl className="grid min-w-0 gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2">
              <DetailField label="Organisation ID">
                <span className="break-all font-mono text-xs">{organisationId}</span>
              </DetailField>
              <DetailField label="User ID">
                <span className="break-all font-mono text-xs">
                  {event.actorClerkUserId ?? "—"}
                </span>
              </DetailField>
              <DetailField label="Entity ID">
                <span className="break-all font-mono text-xs">{event.entityId}</span>
              </DetailField>
              <DetailField label="Actor email">
                <span className="break-all">{event.actorEmail ?? "—"}</span>
              </DetailField>
              <DetailField label="Actor role">
                {event.actorRole ? label(event.actorRole) : "—"}
              </DetailField>
              <DetailField label="Contract ID">
                {event.contractId ? (
                  <Link
                    className="break-all font-mono text-xs underline underline-offset-4"
                    href={`/org/${organisationId}/contracts/${event.contractId}/line-items`}
                  >
                    {event.contractId}
                  </Link>
                ) : (
                  "—"
                )}
              </DetailField>
              <DetailField label="Line item ID">
                {event.lineItemId ? (
                  <Link
                    className="break-all font-mono text-xs underline underline-offset-4"
                    href={`/org/${organisationId}/line-items?q=${encodeURIComponent(event.lineItemId)}`}
                  >
                    {event.lineItemId}
                  </Link>
                ) : (
                  "—"
                )}
              </DetailField>
              <DetailField label="Upload ID">
                {event.uploadId ? (
                  <Link
                    className="break-all font-mono text-xs underline underline-offset-4"
                    href={`/org/${organisationId}/imports?upload=${encodeURIComponent(event.uploadId)}`}
                  >
                    {event.uploadId}
                  </Link>
                ) : (
                  "—"
                )}
              </DetailField>
              <DetailField label="Tradebook import ID">
                <span className="break-all font-mono text-xs">
                  {event.tradebookImportId ?? "—"}
                </span>
              </DetailField>
              <DetailField label="Organisation member ID">
                {event.organisationUserId ? (
                  <Link
                    className="break-all font-mono text-xs underline underline-offset-4"
                    href={`/org/${organisationId}/teams`}
                  >
                    {event.organisationUserId}
                  </Link>
                ) : (
                  "—"
                )}
              </DetailField>
              <DetailField label="Invitation ID">
                <span className="break-all font-mono text-xs">
                  {event.invitationId ?? "—"}
                </span>
              </DetailField>
            </dl>
            <div className="grid min-w-0 gap-3 xl:grid-cols-2">
              <JsonPanel
                title="Before"
                value={event.beforeState}
                changed={event.changedFields}
                tone="before"
              />
              <JsonPanel
                title="After"
                value={event.afterState}
                changed={event.changedFields}
                tone="after"
              />
            </div>
            {event.metadata ? (
              <JsonPanel title="Metadata" value={event.metadata} changed={[]} />
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function OrganisationAuditTrail({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useQueryStates(auditSearchParams, {
    history: "push",
    shallow: true,
    startTransition,
  });
  const input = getAuditListInput(organisationId, state);
  const { data, isLoading, isFetching } = useQuery({
    ...trpc.audit.list.queryOptions(input),
    placeholderData: keepPreviousData,
  });
  useOrganisationEvents({
    organisationId,
    onEvent: async () => {
      await queryClient.invalidateQueries(trpc.audit.list.queryFilter(input));
    },
  });
  const filtered = Boolean(
    state.q ||
      state.action ||
      state.entity ||
      state.actor ||
      state.from ||
      state.to,
  );
  const update = (next: Partial<typeof state>) =>
    void setState({ ...next, ...("page" in next ? {} : { page: 1 }) });
  const sort = (column: typeof state.sort) =>
    update({
      sort: column,
      direction: toggleSortDirection(state.sort, state.direction, column),
    });
  const facets = data?.facets ?? { actions: [], entityTypes: [], actors: [] };
  const pagination = data?.pagination ?? {
    page: state.page,
    pageSize: state.pageSize,
    total: 0,
    pageCount: 0,
  };
  const rows = data?.data ?? [];
  const showEmpty = !isLoading && rows.length === 0;
  const [selectedEvent, setSelectedEvent] = useState<AuditEventRow | null>(null);

  return (
    <section aria-labelledby="audit-title" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="audit-title"
            className="text-2xl font-semibold tracking-tight"
          >
            Audit trail
          </h2>
          <p className="text-sm text-muted-foreground">
            Who changed what, with the state before and after.
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {pagination.total} events
        </p>
      </div>
      <Card aria-busy={pending || isFetching}>
        <CardHeader className="grid gap-3 border-b md:grid-cols-2 xl:grid-cols-6">
          <label htmlFor="audit-search" className="relative md:col-span-2">
            <span className="sr-only">Search audit trail</span>
            <SearchIcon
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <DebouncedInput
              id="audit-search"
              aria-label="Search audit trail"
              placeholder="Search actor, entity or record ID"
              className="pl-9"
              value={state.q}
              onCommit={(q) => update({ q })}
            />
          </label>
          <NativeSelect
            aria-label="Filter by action"
            value={state.action ?? ""}
            onChange={(e) =>
              update({
                action: (e.target.value || null) as typeof state.action,
              })
            }
          >
            <NativeSelectOption value="">All actions</NativeSelectOption>
            {facets.actions.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {label(value)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by entity"
            value={state.entity ?? ""}
            onChange={(e) =>
              update({
                entity: (e.target.value || null) as typeof state.entity,
              })
            }
          >
            <NativeSelectOption value="">All entities</NativeSelectOption>
            {facets.entityTypes.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {label(value)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by actor"
            value={state.actor}
            onChange={(e) => update({ actor: e.target.value })}
          >
            <NativeSelectOption value="">All actors</NativeSelectOption>
            {facets.actors.map((actor) => (
              <NativeSelectOption key={actor.id} value={actor.id}>
                {actor.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label="Audit date from"
              value={state.from}
              onChange={(e) => update({ from: e.target.value })}
            />
            <Input
              type="date"
              aria-label="Audit date to"
              value={state.to}
              onChange={(e) => update({ to: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear audit filters"
              disabled={!filtered}
              onClick={() =>
                void setState({
                  q: "",
                  action: null,
                  entity: null,
                  actor: "",
                  from: "",
                  to: "",
                  page: 1,
                })
              }
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {showEmpty ? (
            <TableEmptyState filtered={filtered} noun="audit events" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortButton
                        label="Time"
                        column="occurredAt"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="Actor"
                        column="actorName"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="Action"
                        column="action"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="Entity"
                        column="entityType"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>Changed fields</TableHead>
                    <TableHead>
                      <span className="sr-only">Details</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBodyLoadingState
                  isLoading={isLoading}
                  isFetching={isFetching}
                  hasData={Boolean(data)}
                  rowCount={state.pageSize}
                  columnCount={6}
                >
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {dateTime.format(new Date(row.occurredAt))}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {row.actorName ?? "Unknown user"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.actorEmail ??
                            row.actorClerkUserId ??
                            "Legacy event"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{label(row.action)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {row.entityLabel ?? row.entityId}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {label(row.entityType)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-72 min-w-0">
                        <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto overscroll-contain">
                          {row.changedFields.length ? (
                            row.changedFields.map((field) => (
                              <Badge key={field} variant="secondary" className="max-w-full truncate">
                                {field}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">
                              No field diff
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEvent(row)}
                        >
                          <EyeIcon aria-hidden="true" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBodyLoadingState>
              </Table>
            </div>
          )}
          <OperationsPagination
            {...pagination}
            onPage={(page) => update({ page })}
            onPageSize={(pageSize) => update({ pageSize })}
          />
        </CardContent>
      </Card>
      <AuditEventSheet
        organisationId={organisationId}
        event={selectedEvent}
        open={selectedEvent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEvent(null);
          }
        }}
      />
    </section>
  );
}
