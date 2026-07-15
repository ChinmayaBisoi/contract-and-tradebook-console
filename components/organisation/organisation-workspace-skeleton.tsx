import { Skeleton } from "@/components/ui/skeleton";

export function OrganisationWorkspaceSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading organisation workspace"
      className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6"
    >
      <div className="flex flex-col gap-5 border-b pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex gap-2 overflow-hidden">
          {["analytics", "contracts", "audit-trail", "teams"].map((item) => (
            <Skeleton key={item} className="h-9 w-24 shrink-0" />
          ))}
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
