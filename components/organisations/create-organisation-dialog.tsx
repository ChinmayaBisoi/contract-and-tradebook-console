"use client";

import { PlusIcon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

export function CreateOrganisationDialog({
  isPending,
  error,
  onCreate,
}: {
  isPending: boolean;
  error: string | null;
  onCreate: (input: { name: string; description?: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();

    if (name.length < 3) {
      return;
    }

    await onCreate({ name, description: description || undefined });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Create organisation
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organisation</DialogTitle>
          <DialogDescription>
            Create a secure workspace for contracts, tradebooks, and members.
          </DialogDescription>
        </DialogHeader>
        <form
          aria-label="Create organisation"
          className="grid gap-4"
          onSubmit={handleSubmit}
        >
          <Field>
            <FieldLabel htmlFor="organisation-name">
              Organisation name
            </FieldLabel>
            <Input
              id="organisation-name"
              name="name"
              minLength={3}
              required
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="organisation-description">
              Description
            </FieldLabel>
            <Textarea
              id="organisation-description"
              name="description"
              placeholder="What will this organisation manage?"
            />
          </Field>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create organisation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
