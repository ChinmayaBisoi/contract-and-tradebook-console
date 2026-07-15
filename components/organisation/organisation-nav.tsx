"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { label: "Analytics", segment: "" },
  { label: "Contracts", segment: "/contracts" },
  { label: "Audit Trail", segment: "/audit-trail" },
  { label: "Teams", segment: "/teams" },
] as const;

export function OrganisationNav({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const rootHref = `/org/${orgId}`;

  return (
    <nav aria-label="Organisation" className="overflow-x-auto">
      <div className="flex min-w-max gap-1">
        {links.map(({ label, segment }) => {
          const href = `${rootHref}${segment}`;
          const isActive = segment
            ? pathname === href || pathname.startsWith(`${href}/`)
            : pathname === href;

          return (
            <Link
              key={label}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
