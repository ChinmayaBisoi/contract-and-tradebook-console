import { ArrowDown, ArrowRight, ChevronsUpDown, Search } from "lucide-react";
import type { Metadata } from "next";

import Topbar from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const organisations = [
  {
    name: "Takeda onboarding testing",
    description: "Counterparty contract intake",
    role: "Owner",
    created: "07 Jul, 2026",
    focus: "Contract review",
  },
  {
    name: "No Credit Chinmaya's Org",
    description: "Tradebook exception review",
    role: "Owner",
    created: "26 May, 2026",
    focus: "Tradebooks",
  },
  {
    name: "Demo organisation",
    description: "Example contract organisation",
    role: "Owner",
    created: "26 Mar, 2026",
    focus: "Evidence map",
  },
  {
    name: "AI Pilot Phase Evaluation 9 Feb 2026",
    description: "Pilot contract QA",
    role: "Owner",
    created: "15 Jan, 2026",
    focus: "Contract review",
  },
  {
    name: "AI testing projects",
    description: "Model-assisted reconciliation",
    role: "Owner",
    created: "17 Dec, 2025",
    focus: "Tradebooks",
  },
];

export const metadata: Metadata = {
  title: "Organisations",
};

function DashboardPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Topbar isLandingPage={false} />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 pb-16 pt-12 sm:px-8 lg:pt-16">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-normal text-zinc-950 sm:text-5xl">
              Your organisations
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Review the contract and tradebook organisations you can access.
            </p>
          </div>
          <Button className="h-12 w-full px-7 text-base font-bold md:w-auto">
            Add Organisation
          </Button>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="relative flex-1">
            <Search className="-translate-y-1/2 absolute top-1/2 left-4 size-5 text-muted-foreground" />
            <Input
              aria-label="Search organisations"
              className="h-12 rounded-lg border-zinc-200 bg-white pl-12 text-base shadow-none placeholder:text-muted-foreground"
              placeholder="Search by name..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {["All", "Contracts", "Tradebooks"].map((filter, index) => (
              <Button
                key={filter}
                variant={index === 0 ? "secondary" : "outline"}
                className="h-12 px-5 text-base font-bold"
              >
                {filter}
              </Button>
            ))}
            <Button className="h-12 px-7 text-base font-bold">Search</Button>
          </div>
        </div>

        <Card className="gap-0 overflow-hidden rounded-lg border-zinc-200 py-0 shadow-none">
          <Table aria-label="ContractView organisations">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-16 px-6 text-base font-bold text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    Name
                    <ChevronsUpDown className="size-4 text-muted-foreground/70" />
                  </span>
                </TableHead>
                <TableHead className="h-16 px-6 text-base font-bold text-muted-foreground">
                  Role
                </TableHead>
                <TableHead className="h-16 px-6 text-base font-bold text-muted-foreground">
                  <span className="inline-flex items-center gap-3">
                    Created
                    <ArrowDown className="size-5 text-muted-foreground" />
                  </span>
                </TableHead>
                <TableHead className="h-16 px-6 text-base font-bold text-muted-foreground">
                  Focus
                </TableHead>
                <TableHead className="h-16 w-14 px-6">
                  <span className="sr-only">Open organisation</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organisations.map((organisation) => (
                <TableRow key={organisation.name} className="hover:bg-primary/5">
                  <TableCell className="min-w-[22rem] px-6 py-6">
                    <div>
                      <p className="text-lg font-bold text-zinc-950">
                        {organisation.name}
                      </p>
                      <p className="mt-2 text-base text-muted-foreground">
                        {organisation.description}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-6 text-base font-semibold text-muted-foreground">
                    {organisation.role}
                  </TableCell>
                  <TableCell className="px-6 py-6 text-lg text-muted-foreground">
                    {organisation.created}
                  </TableCell>
                  <TableCell className="px-6 py-6 text-base font-semibold text-primary">
                    {organisation.focus}
                  </TableCell>
                  <TableCell className="px-6 py-6 text-right">
                    <Button
                      aria-label={`Open ${organisation.name}`}
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ArrowRight className="size-5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </main>
  );
}

export default DashboardPage;
