"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/trpc/client";

const date = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatRole(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function OrganisationSettings({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const input = { id: organisationId };
  const { data: organisation } = useSuspenseQuery(
    trpc.organisation.get.queryOptions(input),
  );
  const updateOrganisation = useMutation(
    trpc.organisation.update.mutationOptions(),
  );
  const [error, setError] = useState<string | null>(null);
  const isOwner = organisation.role === "OWNER";

  useOrganisationEvents({
    organisationId,
    onEvent: async (event) => {
      if (event.entity !== "organisation") {
        return;
      }

      await queryClient.invalidateQueries(
        trpc.organisation.get.queryFilter(input),
      );
    },
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();

    if (name.length < 3) {
      setError("Organisation name must be at least 3 characters.");
      return;
    }

    try {
      await updateOrganisation.mutateAsync({
        id: organisationId,
        name,
        description: description || undefined,
      });
      await Promise.all([
        queryClient.invalidateQueries(trpc.organisation.get.queryFilter(input)),
        queryClient.invalidateQueries(trpc.organisation.list.queryFilter()),
      ]);
      toast.success("Organisation settings saved");
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Organisation settings could not be saved.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <section aria-labelledby="organisation-settings-title" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Workspace
          </p>
          <h2
            id="organisation-settings-title"
            className="text-2xl font-semibold tracking-tight"
          >
            Organisation settings
          </h2>
          <p className="text-sm text-muted-foreground">
            Update the name and description shown across this workspace.
          </p>
        </div>
        <Badge variant="outline">{formatRole(organisation.role)}</Badge>
      </div>

      {!isOwner ? (
        <Alert>
          <AlertTitle>Owner access required</AlertTitle>
          <AlertDescription>
            Only the organisation owner can change these settings. Contact an
            owner if this information needs to be updated.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <h3 className="text-base font-medium">General</h3>
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? "These details appear in the organisation header and dashboard."
              : "Current organisation details for this workspace."}
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <form
            aria-label="Organisation settings"
            className="grid max-w-2xl gap-4"
            onSubmit={handleSubmit}
          >
            <Field>
              <FieldLabel htmlFor="organisation-settings-name">
                Organisation name
              </FieldLabel>
              <Input
                id="organisation-settings-name"
                name="name"
                minLength={3}
                required
                readOnly={!isOwner}
                defaultValue={organisation.name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="organisation-settings-description">
                Description
              </FieldLabel>
              <Textarea
                id="organisation-settings-description"
                name="description"
                readOnly={!isOwner}
                defaultValue={organisation.description ?? ""}
                placeholder="What does this organisation manage?"
              />
            </Field>
            <div className="grid gap-1 text-sm text-muted-foreground">
              <p>Created {date.format(new Date(organisation.createdAt))}</p>
              <p>Last updated {date.format(new Date(organisation.updatedAt))}</p>
            </div>
            {isOwner ? (
              <>
                <FieldError>{error}</FieldError>
                <div>
                  <Button type="submit" disabled={updateOrganisation.isPending}>
                    {updateOrganisation.isPending ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
