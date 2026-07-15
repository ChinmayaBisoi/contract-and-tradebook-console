import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function OrganisationAnalyticsSkeleton() {
  return (
    <section
      role="status"
      aria-label="Loading organisation analytics"
      className="space-y-4"
    >
      <div className="space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          "contracts",
          "line-items",
          "grand-value",
          "avg-line",
          "largest-line",
          "draft",
          "finalized",
          "archived",
        ].map((metric) => (
          <Card key={metric} size="sm">
            <CardHeader>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40 max-w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-3">
        <Card size="sm">
          <CardHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
