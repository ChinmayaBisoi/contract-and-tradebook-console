import type { Metadata } from "next";
import data from "@/app/dashboard-new/data.json";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table-v2";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <DashboardShell title="Dashboard">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* 
        // TODO - Maybe implement analytics using these components
        <SectionCards />
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive />
        </div> */}
        <DataTable data={data} />
      </div>
    </DashboardShell>
  );
}
