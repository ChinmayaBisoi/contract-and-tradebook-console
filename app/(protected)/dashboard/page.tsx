import type { Metadata } from "next";
import { Suspense } from "react";
import { OrganisationDashboard } from "@/components/dashboard/organisation-dashboard";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <DashboardShell title="Dashboard">
      <Suspense
        fallback={
          <div className="px-4 py-10 text-sm text-muted-foreground lg:px-6">
            Loading organisation dashboard...
          </div>
        }
      >
        <OrganisationDashboard />
      </Suspense>
    </DashboardShell>
  );
}
