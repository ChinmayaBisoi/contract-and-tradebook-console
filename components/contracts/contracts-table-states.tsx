"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { DatabaseIcon, RefreshCwIcon } from "lucide-react";
import { Component } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const skeletonRows = ["one", "two", "three", "four", "five", "six", "seven"];

function ContractsError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Contracts unavailable</AlertTitle>
      <AlertDescription>
        Contract records could not be loaded. Try again to refresh this section.
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          <RefreshCwIcon aria-hidden="true" /> Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

class ContractsBoundary extends Component<
  { children: React.ReactNode; resetQueries: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  retry = () => {
    this.props.resetQueries();
    this.setState({ hasError: false });
  };

  render() {
    return this.state.hasError ? (
      <ContractsError onRetry={this.retry} />
    ) : (
      this.props.children
    );
  }
}

export function ContractsErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ContractsBoundary resetQueries={reset}>{children}</ContractsBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export function ContractsTableSkeleton({
  title = "Loading contracts",
}: {
  title?: string;
}) {
  return (
    <section aria-label={title} className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Card>
        <CardHeader className="flex-row gap-3 border-b">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-4">
          {skeletonRows.map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

export function TableEmptyState({
  noun,
  description,
}: {
  noun: string;
  description: string;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="rounded-full border bg-muted/40 p-3">
        <DatabaseIcon
          className="size-5 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <p className="font-medium">No {noun} yet</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
