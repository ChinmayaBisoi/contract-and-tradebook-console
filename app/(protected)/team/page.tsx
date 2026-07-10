import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard-shell";
import { TeamPageContent } from "@/components/team/team-page-content";

export const metadata: Metadata = {
  title: "Team",
};

export default function TeamPage() {
  return (
    <DashboardShell title="Team">
      <TeamPageContent />
    </DashboardShell>
  );
}
