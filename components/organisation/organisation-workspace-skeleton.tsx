import { Skeleton } from "@/components/ui/skeleton";

export function OrganisationWorkspaceSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading organisation workspace"
      className="flex flex-1 flex-col"
    >
      <div className="border-b px-4 py-5 lg:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="px-4 pb-6 pt-4 lg:px-6">
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}
