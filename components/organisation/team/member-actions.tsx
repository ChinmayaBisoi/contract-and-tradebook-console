"use client";

import { useState } from "react";

import { MemberRoleDialog } from "@/components/organisation/team/member-role-dialog";
import type { OrganisationTeamMember } from "@/components/organisation/team/organisation-team-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type OrganisationRole = "OWNER" | "ADMIN" | "MEMBER";

function ConfirmationDialog({
  open,
  title,
  description,
  actionLabel,
  isPending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean>;
}) {
  async function confirm() {
    if (await onConfirm()) {
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            Keep member
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => void confirm()}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function MemberActions({
  member,
  requesterRole,
  isPending,
  onChangeRole,
  onChangeStatus,
  onRemove,
}: {
  member: OrganisationTeamMember;
  requesterRole: OrganisationRole;
  isPending: boolean;
  onChangeRole: (role: OrganisationRole) => Promise<boolean>;
  onChangeStatus: (status: "ACTIVE" | "DISABLED") => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const canChangeRole = requesterRole === "OWNER" && member.canChangeRole;
  const canChangeStatus =
    member.canChangeStatus &&
    (requesterRole === "OWNER" ||
      (requesterRole === "ADMIN" && member.role === "MEMBER"));
  const canRemove = requesterRole === "OWNER" && member.canRemove;

  if (!canChangeRole && !canChangeStatus && !canRemove) {
    return null;
  }

  const statusAction = member.status === "ACTIVE" ? "Disable" : "Enable";

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canChangeRole ? (
        <MemberRoleDialog
          memberName={member.clerkUserName}
          currentRole={member.role}
          isPending={isPending}
          onSave={onChangeRole}
        />
      ) : null}
      {canChangeStatus ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          aria-label={`${statusAction} ${member.clerkUserName}`}
          onClick={() => {
            if (member.status === "ACTIVE") {
              setConfirmStatus(true);
            } else {
              void onChangeStatus("ACTIVE");
            }
          }}
        >
          {statusAction}
        </Button>
      ) : null}
      {canRemove ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isPending}
          aria-label={`Remove ${member.clerkUserName}`}
          onClick={() => setConfirmRemoval(true)}
        >
          Remove
        </Button>
      ) : null}

      <ConfirmationDialog
        open={confirmStatus}
        title={`Disable ${member.clerkUserName}?`}
        description="This member will lose organisation access until an administrator enables them again."
        actionLabel="Disable member"
        isPending={isPending}
        onOpenChange={setConfirmStatus}
        onConfirm={() => onChangeStatus("DISABLED")}
      />
      <ConfirmationDialog
        open={confirmRemoval}
        title={`Remove ${member.clerkUserName}?`}
        description="This member will lose organisation access and must be invited again to return."
        actionLabel="Remove member"
        isPending={isPending}
        onOpenChange={setConfirmRemoval}
        onConfirm={onRemove}
      />
    </div>
  );
}
