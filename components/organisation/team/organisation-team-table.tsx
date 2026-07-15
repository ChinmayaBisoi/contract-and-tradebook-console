"use client";

import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  SearchXIcon,
} from "lucide-react";
import { MemberActions } from "@/components/organisation/team/member-actions";
import type {
  TeamSort,
  TeamSortDirection,
} from "@/components/organisation/team/team-search-params";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type OrganisationTeamMember = {
  id: string;
  clerkUserId: string;
  clerkUserName: string;
  clerkUserEmail: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  status: "ACTIVE" | "DISABLED" | "REMOVED";
  createdAt: Date | string;
  updatedAt: Date | string;
  canChangeRole: boolean;
  canChangeStatus: boolean;
  canRemove: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const roleLabels = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };
const statusLabels = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
  REMOVED: "Removed",
};

function SortButton({
  label,
  column,
  sort,
  sortDirection,
  onSort,
}: {
  label: string;
  column: TeamSort;
  sort: TeamSort;
  sortDirection: TeamSortDirection;
  onSort: (sort: TeamSort) => void;
}) {
  const isActive = sort === column;
  const Icon = isActive
    ? sortDirection === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2"
      aria-label={`Sort by ${label.toLowerCase()}`}
      onClick={() => onSort(column)}
    >
      {label}
      <Icon aria-hidden="true" />
    </Button>
  );
}

export function OrganisationTeamTable({
  members,
  requesterRole,
  isMutating,
  hasFilters,
  sort,
  sortDirection,
  onSort,
  onChangeRole,
  onChangeStatus,
  onRemove,
}: {
  members: OrganisationTeamMember[];
  requesterRole: "OWNER" | "ADMIN" | "MEMBER";
  isMutating: boolean;
  hasFilters: boolean;
  sort: TeamSort;
  sortDirection: TeamSortDirection;
  onSort: (sort: TeamSort) => void;
  onChangeRole: (
    member: OrganisationTeamMember,
    role: "OWNER" | "ADMIN" | "MEMBER",
  ) => Promise<boolean>;
  onChangeStatus: (
    member: OrganisationTeamMember,
    status: "ACTIVE" | "DISABLED",
  ) => Promise<boolean>;
  onRemove: (member: OrganisationTeamMember) => Promise<boolean>;
}) {
  if (members.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <SearchXIcon aria-hidden="true" className="size-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-medium">
            {hasFilters
              ? "No members match your filters"
              : "No team members yet"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "Try changing or clearing the current filters."
              : "Members will appear here when they join this organisation."}
          </p>
        </div>
      </div>
    );
  }

  const hasActions =
    requesterRole !== "MEMBER" &&
    members.some(
      (member) =>
        (requesterRole === "OWNER" && member.canChangeRole) ||
        (member.canChangeStatus &&
          (requesterRole === "OWNER" ||
            (requesterRole === "ADMIN" && member.role === "MEMBER"))) ||
        (requesterRole === "OWNER" && member.canRemove),
    );

  return (
    <Table aria-label="Organisation members">
      <TableHeader>
        <TableRow>
          <TableHead>
            <SortButton
              label="Name"
              column="clerkUserName"
              sort={sort}
              sortDirection={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead>Email</TableHead>
          <TableHead>
            <SortButton
              label="Role"
              column="role"
              sort={sort}
              sortDirection={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead>
            <SortButton
              label="Status"
              column="status"
              sort={sort}
              sortDirection={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead>
            <SortButton
              label="Joined"
              column="createdAt"
              sort={sort}
              sortDirection={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          {hasActions ? (
            <TableHead className="text-right">Actions</TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => {
          const joinedAt = new Date(member.createdAt);

          return (
            <TableRow key={member.id}>
              <TableCell className="font-medium">
                {member.clerkUserName}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {member.clerkUserEmail}
              </TableCell>
              <TableCell>{roleLabels[member.role]}</TableCell>
              <TableCell>
                <Badge
                  variant={member.status === "ACTIVE" ? "secondary" : "outline"}
                  className={
                    member.status === "REMOVED"
                      ? "text-muted-foreground"
                      : undefined
                  }
                >
                  {statusLabels[member.status]}
                </Badge>
              </TableCell>
              <TableCell>
                <time dateTime={joinedAt.toISOString()}>
                  {dateFormatter.format(joinedAt)}
                </time>
              </TableCell>
              {hasActions ? (
                <TableCell className="text-right">
                  <MemberActions
                    member={member}
                    requesterRole={requesterRole}
                    isPending={isMutating}
                    onChangeRole={(role) => onChangeRole(member, role)}
                    onChangeStatus={(status) => onChangeStatus(member, status)}
                    onRemove={() => onRemove(member)}
                  />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
