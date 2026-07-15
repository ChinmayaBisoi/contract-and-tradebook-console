"use client";

import { Building2Icon, InboxIcon, SearchIcon } from "lucide-react";
import Link from "next/link";

import type {
  InvitationRow,
  OrganisationDashboardViewProps,
  OrganisationRow,
} from "@/components/dashboard/organisation-dashboard-types";
import { TablePagination } from "@/components/dashboard/table-pagination";
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog";
import { EditInvitationDialog } from "@/components/invitations/edit-invitation-dialog";
import { CreateOrganisationDialog } from "@/components/organisations/create-organisation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: Date | string) {
  return dateFormatter.format(new Date(value));
}

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function getFilter(
  filters: OrganisationDashboardViewProps["filters"],
  id: string,
) {
  return filters.find((filter) => filter.id === id)?.value ?? "";
}

function TableState({
  isLoading,
  error,
  empty,
  loadingLabel,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: string | null;
  empty: boolean;
  loadingLabel: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        {loadingLabel}
      </div>
    );
  }

  if (error) {
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

  if (empty) {
    return <>{children}</>;
  }

  return <>{children}</>;
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                props.onQueryChange({
                  sort: "name",
                  sortDirection:
                    props.sort === "name" && props.sortDirection === "asc"
                      ? "desc"
                      : "asc",
                })
              }
            >
              Organisation
            </Button>
          </TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Members</TableHead>
          <TableHead>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                props.onQueryChange({
                  sort: "createdAt",
                  sortDirection:
                    props.sort === "createdAt" && props.sortDirection === "desc"
                      ? "asc"
                      : "desc",
                })
              }
            >
              Created
            </Button>
          </TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
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
      </TableBody>
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Direction</TableHead>
          <TableHead>Organisation</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Invited by</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
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
      </TableBody>
    </Table>
  );
}

function Filters({ props }: { props: OrganisationDashboardViewProps }) {
  const direction = getFilter(props.filters, "direction") || "all";

  return (
    <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center">
      <div className="relative max-w-sm flex-1">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={`Search ${props.activeTab}`}
          className="pl-8"
          value={getFilter(props.filters, "search")}
          placeholder={`Search ${props.activeTab}`}
          onChange={(event) =>
            props.onQueryChange({
              filters: [
                ...props.filters.filter((filter) => filter.id !== "search"),
                ...(event.target.value
                  ? [{ id: "search", value: event.target.value }]
                  : []),
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
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="organisations" className="px-4 pb-6 lg:px-6">
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Filters props={props} />
          <TableState
            isLoading={props.isLoading}
            error={props.error}
            empty={props.organisations.length === 0}
            loadingLabel="Loading organisations..."
            onRetry={props.onRetry}
          >
            <OrganisationTable rows={props.organisations} props={props} />
          </TableState>
          {!props.isLoading && !props.error && (
            <TablePagination
              pagination={props.pagination}
              onPageChange={(page) => props.onQueryChange({ page })}
              onPageSizeChange={(pageSize) => props.onQueryChange({ pageSize })}
            />
          )}
        </div>
      </TabsContent>
      <TabsContent value="invitations" className="px-4 pb-6 lg:px-6">
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Filters props={props} />
          <TableState
            isLoading={props.isLoading}
            error={props.error}
            empty={props.invitations.length === 0}
            loadingLabel="Loading invitations..."
            onRetry={props.onRetry}
          >
            <InvitationsTable rows={props.invitations} props={props} />
          </TableState>
          {!props.isLoading && !props.error && (
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
