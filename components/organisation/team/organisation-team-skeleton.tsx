import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function OrganisationTeamSkeleton() {
  return (
    <section
      role="status"
      aria-label="Loading organisation team"
      className="space-y-4"
    >
      <div className="space-y-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Card>
        <CardHeader className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_auto_auto_auto]">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          {["one", "two", "three", "four", "five"].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
