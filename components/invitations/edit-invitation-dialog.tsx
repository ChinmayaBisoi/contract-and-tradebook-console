"use client";

import { useState } from "react";

import type { InvitationRow } from "@/components/dashboard/organisation-dashboard-types";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

export function EditInvitationDialog({
  invitation,
  isPending,
  error,
  onUpdate,
}: {
  invitation: InvitationRow;
  isPending: boolean;
  error: string | null;
  onUpdate: (input: {
    id: string;
    role: "ADMIN" | "MEMBER";
    expiresAt: Date;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = String(form.get("role") ?? invitation.role) as
      | "ADMIN"
      | "MEMBER";
    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + Number(form.get("expiresInDays") ?? 7),
    );
    await onUpdate({ id: invitation.id, role, expiresAt });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Edit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit invitation</DialogTitle>
          <DialogDescription>{invitation.email}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor={`edit-role-${invitation.id}`}>Role</FieldLabel>
            <NativeSelect
              id={`edit-role-${invitation.id}`}
              name="role"
              defaultValue={invitation.role}
            >
              <NativeSelectOption value="MEMBER">Member</NativeSelectOption>
              {invitation.role === "ADMIN" && (
                <NativeSelectOption value="ADMIN">Admin</NativeSelectOption>
              )}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`edit-expiry-${invitation.id}`}>
              Extend expiry
            </FieldLabel>
            <NativeSelect
              id={`edit-expiry-${invitation.id}`}
              name="expiresInDays"
              defaultValue="7"
            >
              <NativeSelectOption value="1">1 day</NativeSelectOption>
              <NativeSelectOption value="7">7 days</NativeSelectOption>
              <NativeSelectOption value="14">14 days</NativeSelectOption>
              <NativeSelectOption value="30">30 days</NativeSelectOption>
            </NativeSelect>
          </Field>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
