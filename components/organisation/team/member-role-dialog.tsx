"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

type OrganisationRole = "OWNER" | "ADMIN" | "MEMBER";

export function MemberRoleDialog({
  memberName,
  currentRole,
  isPending,
  onSave,
}: {
  memberName: string;
  currentRole: OrganisationRole;
  isPending: boolean;
  onSave: (role: OrganisationRole) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<OrganisationRole>(currentRole);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setRole(currentRole);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onSave(role)) {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        aria-label={`Change ${memberName} role`}
        onClick={() => setOpen(true)}
      >
        Change role
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change {memberName}&apos;s role</DialogTitle>
          <DialogDescription>
            Role permissions take effect as soon as this change is saved.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor={`member-role-${memberName}`}>Role</FieldLabel>
            <NativeSelect
              id={`member-role-${memberName}`}
              aria-label="Role"
              value={role}
              disabled={isPending}
              onChange={(event) =>
                setRole(event.target.value as OrganisationRole)
              }
            >
              <NativeSelectOption value="OWNER">Owner</NativeSelectOption>
              <NativeSelectOption value="ADMIN">Admin</NativeSelectOption>
              <NativeSelectOption value="MEMBER">Member</NativeSelectOption>
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={isPending || role === currentRole}>
              {isPending ? "Saving role" : "Save role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
