"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Component } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function OrganisationSectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>
        <h2>Analytics unavailable</h2>
      </AlertTitle>
      <AlertDescription>
        <p>
          Organisation analytics could not be loaded. Try again to refresh this
          section.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          <RefreshCwIcon aria-hidden="true" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

class SectionErrorBoundary extends Component<
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
    if (this.state.hasError) {
      return <OrganisationSectionError onRetry={this.retry} />;
    }

    return this.props.children;
  }
}

export function OrganisationSectionErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <SectionErrorBoundary resetQueries={reset}>
          {children}
        </SectionErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
