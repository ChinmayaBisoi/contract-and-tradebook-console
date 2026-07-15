import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export function UnavailableSection({
  title,
  description,
  icon: Icon,
  orgId,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  orgId: string;
}) {
  const titleId = `organisation-${title.toLowerCase().replaceAll(" ", "-")}-title`;

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center sm:px-10"
    >
      <div className="mx-auto flex max-w-lg flex-col items-center">
        <span className="mb-4 rounded-xl border bg-background p-3 text-muted-foreground shadow-sm">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <Link
          href={`/org/${orgId}`}
          className="mt-5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Back to organisation analytics
        </Link>
      </div>
    </section>
  );
}
