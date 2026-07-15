"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { EyeIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import {
  auditSearchParams,
  getAuditListInput,
} from "@/components/operations/search-params";
import {
  OperationsPagination,
  SortButton,
  TableEmptyState,
} from "@/components/operations/table-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
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
      className={`min-w-0 rounded-lg border-l-4 bg-muted/20 p-3 ${
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
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">No state recorded.</p>
      )}{" "}
      {changed.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Changed: {changed.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

export function OrganisationAuditTrail({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useQueryStates(auditSearchParams, {
    history: "push",
    shallow: true,
    startTransition,
  });
  const { data } = useSuspenseQuery(
    trpc.audit.list.queryOptions(getAuditListInput(organisationId, state)),
  );
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
      direction:
        state.sort === column && state.direction === "asc" ? "desc" : "asc",
    });

  return (
    <section aria-labelledby="audit-title" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Immutable activity
          </p>
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
          {data.pagination.total} events
        </p>
      </div>
      <Card aria-busy={pending}>
        <CardHeader className="grid gap-3 border-b md:grid-cols-2 xl:grid-cols-6">
          <label htmlFor="audit-search" className="relative md:col-span-2">
            <span className="sr-only">Search audit trail</span>
            <SearchIcon
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="audit-search"
              aria-label="Search audit trail"
              placeholder="Search actor, entity or record ID"
              className="pl-9"
              value={state.q}
              onChange={(e) => update({ q: e.target.value })}
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
            {data.facets.actions.map((value) => (
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
            {data.facets.entityTypes.map((value) => (
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
            {data.facets.actors.map((actor) => (
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
          {data.data.length === 0 ? (
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
                <TableBody>
                  {data.data.map((row) => (
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
                      <TableCell className="max-w-72">
                        <div className="flex flex-wrap gap-1">
                          {row.changedFields.length ? (
                            row.changedFields.map((field) => (
                              <Badge key={field} variant="secondary">
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
                        <Dialog>
                          <DialogTrigger
                            render={
                              <Button type="button" variant="ghost" size="sm" />
                            }
                          >
                            <EyeIcon aria-hidden="true" />
                            View
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>
                                {label(row.action)} ·{" "}
                                {row.entityLabel ?? row.entityId}
                              </DialogTitle>
                              <DialogDescription>
                                {row.actorName ?? "Unknown user"} ·{" "}
                                {dateTime.format(new Date(row.occurredAt))}
                              </DialogDescription>
                            </DialogHeader>
                            <dl className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                              <div>
                                <dt className="text-muted-foreground">
                                  Organisation ID
                                </dt>
                                <dd className="font-mono text-xs">
                                  {organisationId}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  User ID
                                </dt>
                                <dd className="font-mono text-xs">
                                  {row.actorClerkUserId ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Entity ID
                                </dt>
                                <dd className="font-mono text-xs">
                                  {row.entityId}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Actor email
                                </dt>
                                <dd>{row.actorEmail ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Actor role
                                </dt>
                                <dd>
                                  {row.actorRole ? label(row.actorRole) : "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Contract ID
                                </dt>
                                <dd className="font-mono text-xs">
                                  {row.contractId ? (
                                    <Link
                                      className="underline underline-offset-4"
                                      href={`/org/${organisationId}/contracts/${row.contractId}/line-items`}
                                    >
                                      {row.contractId}
                                    </Link>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Line item ID
                                </dt>
                                <dd className="font-mono text-xs">
                                  {row.lineItemId ? (
                                    <Link
                                      className="underline underline-offset-4"
                                      href={`/org/${organisationId}/line-items?q=${encodeURIComponent(row.lineItemId)}`}
                                    >
                                      {row.lineItemId}
                                    </Link>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Upload ID
                                </dt>
                                <dd className="font-mono text-xs">
                                  {row.uploadId ? (
                                    <Link
                                      className="underline underline-offset-4"
                                      href={`/org/${organisationId}/imports?upload=${encodeURIComponent(row.uploadId)}`}
                                    >
                                      {row.uploadId}
                                    </Link>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Tradebook import ID
                                </dt>
                                <dd className="font-mono text-xs">
                                  {row.tradebookImportId ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Organisation member ID
                                </dt>
                                <dd className="font-mono text-xs">
                                  {row.organisationUserId ? (
                                    <Link
                                      className="underline underline-offset-4"
                                      href={`/org/${organisationId}/teams`}
                                    >
                                      {row.organisationUserId}
                                    </Link>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Invitation ID
                                </dt>
                                <dd className="font-mono text-xs">
                                  {row.invitationId ?? "—"}
                                </dd>
                              </div>
                            </dl>
                            <div className="grid gap-3 lg:grid-cols-2">
                              <JsonPanel
                                title="Before"
                                value={row.beforeState}
                                changed={row.changedFields}
                                tone="before"
                              />
                              <JsonPanel
                                title="After"
                                value={row.afterState}
                                changed={row.changedFields}
                                tone="after"
                              />
                            </div>
                            {row.metadata ? (
                              <JsonPanel
                                title="Metadata"
                                value={row.metadata}
                                changed={[]}
                              />
                            ) : null}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <OperationsPagination
            {...data.pagination}
            onPage={(page) => update({ page })}
            onPageSize={(pageSize) => update({ pageSize })}
          />
        </CardContent>
      </Card>
    </section>
  );
}
