import type { Metadata } from "next";
import { OrganisationDashboard } from "@/components/dashboard/organisation-dashboard";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <DashboardShell title="Dashboard">
      <OrganisationDashboard />
    </DashboardShell>
  );
}
