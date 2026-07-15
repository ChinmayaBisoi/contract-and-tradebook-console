"use client";

import {
  QueryErrorResetBoundary,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import Link from "next/link";
import { Component } from "react";

import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";

export type CodedOrganisationError = Error & {
  data?: { code?: unknown };
  shape?: { data?: { code?: unknown } };
};

function getSafeErrorCode(error: CodedOrganisationError) {
  const codes = [error.data?.code, error.shape?.data?.code];

  return codes.find((code): code is string => typeof code === "string");
}

export function OrganisationErrorView({
  error,
  onRetry,
}: {
  error: CodedOrganisationError;
  onRetry: () => void;
}) {
  const code = getSafeErrorCode(error);
  const isAccessError = code === "UNAUTHORIZED" || code === "FORBIDDEN";
  const title = isAccessError
    ? "Organisation access restricted"
    : "Organisation unavailable";
  const description = isAccessError
    ? "Your account does not have access to this organisation."
    : "This organisation could not be found or is temporarily unavailable.";

  return (
    <main className="grid flex-1 place-items-center px-4 py-12 lg:px-6">
      <section
        role="alert"
        aria-labelledby="organisation-error-title"
        className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="space-y-2">
          <h1
            id="organisation-error-title"
            className="text-xl font-semibold tracking-tight"
          >
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="outline" render={<Link href="/dashboard" />}>
            Back to dashboard
          </Button>
        </div>
      </section>
    </main>
  );
}

class OrganisationErrorBoundary extends Component<
  {
    children: React.ReactNode;
    resetQueries: () => void;
  },
  { error: CodedOrganisationError | null }
> {
  state = { error: null } as { error: CodedOrganisationError | null };

  static getDerivedStateFromError(error: CodedOrganisationError) {
    return { error };
  }

  retry = () => {
    this.props.resetQueries();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <OrganisationErrorView error={this.state.error} onRetry={this.retry} />
      );
    }

    return this.props.children;
  }
}

export function OrganisationWorkspaceErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <OrganisationErrorBoundary resetQueries={reset}>
          {children}
        </OrganisationErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

function formatRole(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function OrganisationWorkspace({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const input = { id: orgId };
  const { data: organisation } = useSuspenseQuery(
    trpc.organisation.get.queryOptions(input),
  );
  useOrganisationEvents({
    organisationId: orgId,
    onEvent: async (event) => {
      if (event.entity !== "organisation") {
        return;
      }

      await queryClient.invalidateQueries(trpc.organisation.get.queryFilter(input));
    },
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b px-4 py-5 lg:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Organisation
            </p>
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {organisation.name}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {organisation.description || "No description provided."}
            </p>
          </div>
          <Badge variant="outline">{formatRole(organisation.role)}</Badge>
        </div>
      </header>
      <div className="px-4 pb-6 pt-4 lg:px-6">{children}</div>
    </div>
  );
}
