"use client";

import { Building2Icon, InboxIcon, SearchIcon } from "lucide-react";
import Link from "next/link";

import type {
  InvitationRow,
  OrganisationDashboardViewProps,
  OrganisationRow,
} from "@/components/dashboard/organisation-dashboard-types";
import { TablePagination } from "@/components/dashboard/table-pagination";
import { DebouncedInput } from "@/components/filters/debounced-input";
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog";
import { EditInvitationDialog } from "@/components/invitations/edit-invitation-dialog";
import { CreateOrganisationDialog } from "@/components/organisations/create-organisation-dialog";
import {
  SortButton,
  TableBodyLoadingState,
  toggleSortDirection,
} from "@/components/operations/table-states";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatDate(value: Date | string) {
  return dateFormatter.format(new Date(value));
}

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function canViewContractMetrics(role: OrganisationRow["role"]) {
  return role === "OWNER" || role === "ADMIN";
}

function getFilter(
  filters: OrganisationDashboardViewProps["filters"],
  id: string,
) {
  return filters.find((filter) => filter.id === id)?.value ?? "";
}

function getOrgSort(sort: string | null): "name" | "createdAt" {
  return sort === "name" ? "name" : "createdAt";
}

function getInvitationSort(
  sort: string | null,
): "createdAt" | "email" | "expiresAt" {
  if (sort === "email" || sort === "expiresAt") {
    return sort;
  }

  return "createdAt";
}

function TableErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="grid justify-items-center gap-3 p-10 text-center"
    >
      <p className="text-sm text-destructive">{error}</p>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function OrganisationTable({
  rows,
  props,
}: {
  rows: OrganisationRow[];
  props: OrganisationDashboardViewProps;
}) {
  if (rows.length === 0 && !props.isLoading && !props.error) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2Icon />
          </EmptyMedia>
          <EmptyTitle>No organisations yet</EmptyTitle>
          <EmptyDescription>
            Create your first organisation to start managing contracts and
            access.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const activeSort = getOrgSort(props.sort);
  const activeDirection = props.sortDirection ?? "desc";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <SortButton
              label="Organisation"
              column="name"
              sort={activeSort}
              direction={activeDirection}
              onSort={(column) =>
                props.onQueryChange({
                  sort: column,
                  sortDirection: toggleSortDirection(
                    activeSort,
                    activeDirection,
                    column,
                  ),
                })
              }
            />
          </TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Members</TableHead>
          <TableHead>Contracts</TableHead>
          <TableHead>Total value</TableHead>
          <TableHead>
            <SortButton
              label="Created"
              column="createdAt"
              sort={activeSort}
              direction={activeDirection}
              onSort={(column) =>
                props.onQueryChange({
                  sort: column,
                  sortDirection: toggleSortDirection(
                    activeSort,
                    activeDirection,
                    column,
                    "desc",
                  ),
                })
              }
            />
          </TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBodyLoadingState
        isLoading={props.isLoading}
        isFetching={props.isFetching}
        hasData={!props.isLoading || rows.length > 0}
        rowCount={props.pageSize}
        columnCount={8}
      >
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="max-w-72 text-muted-foreground">
              {row.description || "No description"}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{titleCase(row.role)}</Badge>
            </TableCell>
            <TableCell>{row.activeMemberCount} members</TableCell>
            <TableCell>
              {canViewContractMetrics(row.role)
                ? row.totalContractCount ?? 0
                : "Restricted"}
            </TableCell>
            <TableCell>
              {canViewContractMetrics(row.role)
                ? currencyFormatter.format(row.totalContractValue ?? 0)
                : "Restricted"}
            </TableCell>
            <TableCell>{formatDate(row.createdAt)}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Link
                  href={`/org/${row.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Open
                </Link>
                {(row.role === "OWNER" || row.role === "ADMIN") && (
                  <CreateInvitationDialog
                    organisationId={row.id}
                    organisationName={row.name}
                    requesterRole={row.role}
                    isPending={props.isMutating}
                    error={props.mutationError}
                    onCreate={props.onCreateInvitation}
                  />
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBodyLoadingState>
    </Table>
  );
}

function InvitationActions({
  row,
  props,
}: {
  row: InvitationRow;
  props: OrganisationDashboardViewProps;
}) {
  if (!row.canAccept && !row.canDecline && !row.canEdit && !row.canCancel) {
    return <span className="text-muted-foreground">No actions</span>;
  }

  return (
    <div className="flex justify-end gap-1">
      {row.canAccept && (
        <Button size="sm" onClick={() => props.onAcceptInvitation(row.id)}>
          Accept
        </Button>
      )}
      {row.canDecline && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => props.onDeclineInvitation(row.id)}
        >
          Decline
        </Button>
      )}
      {row.canEdit && (
        <EditInvitationDialog
          invitation={row}
          isPending={props.isMutating}
          error={props.mutationError}
          onUpdate={props.onUpdateInvitation}
        />
      )}
      {row.canCancel && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => props.onCancelInvitation(row.id)}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

function InvitationsTable({
  rows,
  props,
}: {
  rows: InvitationRow[];
  props: OrganisationDashboardViewProps;
}) {
  if (rows.length === 0 && !props.isLoading && !props.error) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>No invitations found</EmptyTitle>
          <EmptyDescription>
            Received and managed invitations will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const activeSort = getInvitationSort(props.sort);
  const activeDirection = props.sortDirection ?? "desc";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Direction</TableHead>
          <TableHead>Organisation</TableHead>
          <TableHead>
            <SortButton
              label="Email"
              column="email"
              sort={activeSort}
              direction={activeDirection}
              onSort={(column) =>
                props.onQueryChange({
                  sort: column,
                  sortDirection: toggleSortDirection(
                    activeSort,
                    activeDirection,
                    column,
                  ),
                })
              }
            />
          </TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Invited by</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <SortButton
              label="Expires"
              column="expiresAt"
              sort={activeSort}
              direction={activeDirection}
              onSort={(column) =>
                props.onQueryChange({
                  sort: column,
                  sortDirection: toggleSortDirection(
                    activeSort,
                    activeDirection,
                    column,
                    "desc",
                  ),
                })
              }
            />
          </TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBodyLoadingState
        isLoading={props.isLoading}
        isFetching={props.isFetching}
        hasData={!props.isLoading || rows.length > 0}
        rowCount={props.pageSize}
        columnCount={8}
      >
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              {row.direction === "both"
                ? "Received + managed"
                : titleCase(row.direction)}
            </TableCell>
            <TableCell className="font-medium">
              {row.organisationName}
            </TableCell>
            <TableCell>{row.email}</TableCell>
            <TableCell>
              <Badge variant="outline">{titleCase(row.role)}</Badge>
            </TableCell>
            <TableCell>{row.inviterName}</TableCell>
            <TableCell>
              <Badge
                variant={row.status === "PENDING" ? "secondary" : "outline"}
              >
                {titleCase(row.status)}
              </Badge>
            </TableCell>
            <TableCell>{formatDate(row.expiresAt)}</TableCell>
            <TableCell className="text-right">
              <InvitationActions row={row} props={props} />
            </TableCell>
          </TableRow>
        ))}
      </TableBodyLoadingState>
    </Table>
  );
}

function Filters({ props }: { props: OrganisationDashboardViewProps }) {
  const direction = getFilter(props.filters, "direction") || "all";

  return (
    <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center">
      <div className="relative max-w-sm flex-1">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <DebouncedInput
          aria-label={`Search ${props.activeTab}`}
          className="pl-8"
          value={getFilter(props.filters, "search")}
          placeholder={`Search ${props.activeTab}`}
          onCommit={(value) =>
            props.onQueryChange({
              filters: [
                ...props.filters.filter((filter) => filter.id !== "search"),
                ...(value ? [{ id: "search", value }] : []),
              ],
            })
          }
        />
      </div>
      {props.activeTab === "invitations" && (
        <NativeSelect
          aria-label="Invitation direction"
          value={direction}
          onChange={(event) =>
            props.onQueryChange({
              filters: [
                ...props.filters.filter((filter) => filter.id !== "direction"),
                { id: "direction", value: event.target.value },
              ],
            })
          }
        >
          <NativeSelectOption value="all">All invitations</NativeSelectOption>
          <NativeSelectOption value="received">Received</NativeSelectOption>
          <NativeSelectOption value="managed">Managed</NativeSelectOption>
        </NativeSelect>
      )}
    </div>
  );
}

export function OrganisationDashboardView(
  props: OrganisationDashboardViewProps,
) {
  return (
    <Tabs
      value={props.activeTab}
      onValueChange={(value) =>
        props.onQueryChange({ tab: value as "organisations" | "invitations" })
      }
      className="gap-0"
    >
      <div className="flex flex-col gap-4 border-b px-4 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Access control
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            Organisation directory
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create organisations, invite teammates, and review every access
            request.
          </p>
        </div>
        <CreateOrganisationDialog
          isPending={props.isMutating}
          error={props.mutationError}
          onCreate={props.onCreateOrganisation}
        />
      </div>
      <div className="px-4 pt-4 lg:px-6">
        <TabsList variant="line">
          <TabsTrigger value="organisations">Organisations</TabsTrigger>
          <TabsTrigger value="invitations">
            Invitations
            {props.pendingReceivedCount > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {props.pendingReceivedCount}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="organisations" className="px-4 pb-6 lg:px-6">
        <div
          className="overflow-hidden rounded-xl border bg-card shadow-xs"
          aria-busy={props.isFetching || undefined}
        >
          <Filters props={props} />
          {props.error ? (
            <TableErrorState error={props.error} onRetry={props.onRetry} />
          ) : (
            <OrganisationTable rows={props.organisations} props={props} />
          )}
          {!props.error && (
            <TablePagination
              pagination={props.pagination}
              onPageChange={(page) => props.onQueryChange({ page })}
              onPageSizeChange={(pageSize) => props.onQueryChange({ pageSize })}
            />
          )}
        </div>
      </TabsContent>
      <TabsContent value="invitations" className="px-4 pb-6 lg:px-6">
        <div
          className="overflow-hidden rounded-xl border bg-card shadow-xs"
          aria-busy={props.isFetching || undefined}
        >
          {props.mutationError ? (
            <div role="alert" className="border-b bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {props.mutationError}
            </div>
          ) : null}
          <Filters props={props} />
          {props.error ? (
            <TableErrorState error={props.error} onRetry={props.onRetry} />
          ) : (
            <InvitationsTable rows={props.invitations} props={props} />
          )}
          {!props.error && (
            <TablePagination
              pagination={props.pagination}
              onPageChange={(page) => props.onQueryChange({ page })}
              onPageSizeChange={(pageSize) => props.onQueryChange({ pageSize })}
            />
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
