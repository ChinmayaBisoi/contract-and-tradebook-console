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
        {["active", "disabled", "invitations", "age"].map((metric) => (
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
      <div className="grid gap-3 sm:grid-cols-2">
        {["contracts", "audit"].map((metric) => (
          <Card key={metric} size="sm">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-5 w-24 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
