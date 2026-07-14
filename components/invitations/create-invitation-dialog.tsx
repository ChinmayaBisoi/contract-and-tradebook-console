"use client";

import { UserPlusIcon } from "lucide-react";
import { useState } from "react";

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
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

export function CreateInvitationDialog({
  organisationId,
  organisationName,
  requesterRole,
  isPending,
  error,
  onCreate,
}: {
  organisationId: string;
  organisationName: string;
  requesterRole: "OWNER" | "ADMIN";
  isPending: boolean;
  error: string | null;
  onCreate: (input: {
    organisationId: string;
    email: string;
    role: "ADMIN" | "MEMBER";
    expiresAt: Date;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const role = String(form.get("role") ?? "MEMBER") as "ADMIN" | "MEMBER";
    const expiresInDays = Number(form.get("expiresInDays") ?? 7);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await onCreate({ organisationId, email, role, expiresAt });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <UserPlusIcon />
        Invite member
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to {organisationName}</DialogTitle>
          <DialogDescription>
            This invitation is stored in ContractView and can be accepted from
            the dashboard.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor={`invite-email-${organisationId}`}>
              Email
            </FieldLabel>
            <Input
              id={`invite-email-${organisationId}`}
              name="email"
              type="email"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`invite-role-${organisationId}`}>
              Role
            </FieldLabel>
            <NativeSelect id={`invite-role-${organisationId}`} name="role">
              <NativeSelectOption value="MEMBER">Member</NativeSelectOption>
              {requesterRole === "OWNER" && (
                <NativeSelectOption value="ADMIN">Admin</NativeSelectOption>
              )}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`invite-expiry-${organisationId}`}>
              Expires in
            </FieldLabel>
            <NativeSelect
              id={`invite-expiry-${organisationId}`}
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
              {isPending ? "Creating..." : "Create invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
