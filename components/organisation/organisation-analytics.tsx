"use client";

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  ArchiveIcon,
  CalculatorIcon,
  FileStackIcon,
  FileTextIcon,
  HandCoinsIcon,
  ReceiptTextIcon,
  ScaleIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTRPC } from "@/trpc/client";

const integerFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const timelineChartConfig = {
  contractValue: {
    label: "Contract value",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type RangePreset = "all" | "30d" | "90d" | "180d" | "custom";
type AnalyticsDateValue = string | Date | null | undefined;
type AnalyticsFilters = {
  contractId?: string;
  status?: "DRAFT" | "FINALIZED" | "ARCHIVED";
  poDateFrom?: Date;
  poDateTo?: Date;
};

function formatInteger(value: number) {
  return integerFormatter.format(value);
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatCompactCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }

  return formatCurrency(value);
}

function toDateValue(date: AnalyticsDateValue): Date | null {
  return date ? new Date(date) : null;
}

function toDateInputValue(date: AnalyticsDateValue): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

function parseDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function shiftDate(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function shiftMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function clampDate(date: Date, min: Date, max: Date) {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function getPresetStartDate(
  preset: Exclude<RangePreset, "all" | "custom">,
  max: Date,
) {
  if (preset === "30d") return shiftDate(max, -30);
  if (preset === "90d") return shiftMonths(max, -3);
  return shiftMonths(max, -6);
}

function formatStatusLabel(status: AnalyticsFilters["status"] | "ALL") {
  if (status === "ALL") return "All statuses";
  if (status === "DRAFT") return "Draft";
  if (status === "FINALIZED") return "Finalized";
  return "Archived";
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof FileTextIcon;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  controls,
  children,
}: {
  title: string;
  description: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {controls ? <CardAction>{controls}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TimelineTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      date: string;
      contractCount: number;
      lineItemCount: number;
      contractValue: number;
    };
  }>;
  label?: string;
}) {
  if (!active || !payload?.[0]?.payload) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="grid min-w-44 gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <div className="font-medium">
        {longDateFormatter.format(new Date(`${label ?? point.date}T00:00:00.000Z`))}
      </div>
      <div className="space-y-1 text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <span>Total value</span>
          <span className="font-mono font-medium text-foreground">
            {formatCurrency(point.contractValue)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Contracts</span>
          <span className="font-mono font-medium text-foreground">
            {formatInteger(point.contractCount)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Line items</span>
          <span className="font-mono font-medium text-foreground">
            {formatInteger(point.lineItemCount)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function OrganisationAnalytics({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [contractId, setContractId] = useState("all");
  const [status, setStatus] = useState<
    "ALL" | "DRAFT" | "FINALIZED" | "ARCHIVED"
  >("ALL");
  const [rangePreset, setRangePreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { data: organisation } = useSuspenseQuery(
    trpc.organisation.get.queryOptions({ id: organisationId }),
  );
  const { data: baseAnalytics } = useSuspenseQuery(
    trpc.organisation.getAnalytics.queryOptions({ organisationId }),
  );

  const fullRangeStart = toDateValue(baseAnalytics.poDateRange.min);
  const fullRangeEnd = toDateValue(baseAnalytics.poDateRange.max);

  useEffect(() => {
    if (rangePreset !== "custom") return;
    if (!customFrom && fullRangeStart) {
      setCustomFrom(toDateInputValue(fullRangeStart));
    }
    if (!customTo && fullRangeEnd) {
      setCustomTo(toDateInputValue(fullRangeEnd));
    }
  }, [customFrom, customTo, fullRangeEnd, fullRangeStart, rangePreset]);

  const activeRange = useMemo(() => {
    if (!fullRangeStart || !fullRangeEnd) {
      return { from: undefined, to: undefined };
    }

    if (rangePreset === "all") {
      return { from: fullRangeStart, to: fullRangeEnd };
    }

    if (rangePreset === "custom") {
      const parsedFrom = parseDateInput(customFrom);
      const parsedTo = parseDateInput(customTo);
      return {
        from: parsedFrom
          ? clampDate(parsedFrom, fullRangeStart, fullRangeEnd)
          : undefined,
        to: parsedTo
          ? clampDate(parsedTo, fullRangeStart, fullRangeEnd)
          : undefined,
      };
    }

    return {
      from: clampDate(
        getPresetStartDate(rangePreset, fullRangeEnd),
        fullRangeStart,
        fullRangeEnd,
      ),
      to: fullRangeEnd,
    };
  }, [customFrom, customTo, fullRangeEnd, fullRangeStart, rangePreset]);

  const timelineFilters = useMemo(
    () => ({
      ...(contractId !== "all" ? { contractId } : {}),
      ...(status !== "ALL" ? { status } : {}),
      ...(activeRange.from ? { poDateFrom: activeRange.from } : {}),
      ...(activeRange.to ? { poDateTo: activeRange.to } : {}),
    }),
    [activeRange.from, activeRange.to, contractId, status],
  );
  const isDefaultTimeline =
    contractId === "all" && status === "ALL" && rangePreset === "all";
  const {
    data: timelineAnalytics,
    isFetching: timelineIsFetching,
    isError: timelineIsError,
    refetch: refetchTimeline,
  } = useQuery({
    ...trpc.organisation.getAnalytics.queryOptions({
      organisationId,
      filters: timelineFilters,
    }),
    initialData: isDefaultTimeline ? baseAnalytics : undefined,
    placeholderData: keepPreviousData,
  });

  useOrganisationEvents({
    organisationId,
    onEvent: async (event) => {
      if (
        event.entity !== "organisation" &&
        event.entity !== "contract" &&
        event.entity !== "lineItem"
      ) {
        return;
      }

      await queryClient.invalidateQueries(
        trpc.organisation.getAnalytics.queryFilter(),
      );
    },
  });

  if (organisation.role !== "OWNER" && organisation.role !== "ADMIN") {
    return null;
  }

  const rangeDescription =
    activeRange.from && activeRange.to
      ? `Contract value by PO date from ${longDateFormatter.format(activeRange.from)} to ${longDateFormatter.format(activeRange.to)}.`
      : "Contract value by PO date.";
  const timelinePoints = timelineAnalytics?.contractsOverTime ?? [];

  return (
    <section
      aria-labelledby="organisation-analytics-title"
      className="space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2
            id="organisation-analytics-title"
            className="text-lg font-semibold tracking-tight"
          >
            Overview
          </h2>
          <p className="text-sm text-muted-foreground">
            Live contract totals and summary-sheet PO date activity for this
            organisation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/org/${organisationId}/imports`} />}
          >
            Import workbook
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href={`/api/org/${organisationId}/export?format=excel`} />
            }
          >
            Export Excel
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href={`/api/org/${organisationId}/export?format=json`} />
            }
          >
            Export JSON
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total contracts"
          value={formatInteger(baseAnalytics.totalContracts)}
          description="All contracts in this organisation"
          icon={FileTextIcon}
        />
        <MetricCard
          label="Total line items"
          value={formatInteger(baseAnalytics.totalLineItems)}
          description="Line items across every contract"
          icon={ReceiptTextIcon}
        />
        <MetricCard
          label="Grand contract value"
          value={formatCurrency(baseAnalytics.grandContractValue)}
          description="Sum of all contract totals"
          icon={HandCoinsIcon}
        />
        <MetricCard
          label="Average line value"
          value={formatCurrency(baseAnalytics.averageLineValue)}
          description="Average line-item total"
          icon={CalculatorIcon}
        />
        <MetricCard
          label="Largest line value"
          value={formatCurrency(baseAnalytics.largestLineValue)}
          description="Highest line-item total"
          icon={ScaleIcon}
        />
        <MetricCard
          label="Draft contracts"
          value={formatInteger(baseAnalytics.draftContracts)}
          description="Contracts still in draft"
          icon={FileStackIcon}
        />
        <MetricCard
          label="Finalized contracts"
          value={formatInteger(baseAnalytics.finalizedContracts)}
          description="Contracts ready for execution"
          icon={HandCoinsIcon}
        />
        <MetricCard
          label="Archived contracts"
          value={formatInteger(baseAnalytics.archivedContracts)}
          description="Closed or retired contracts"
          icon={ArchiveIcon}
        />
      </div>

      <div className="grid gap-3">
        <div className="grid gap-3 rounded-xl border bg-card p-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label
              htmlFor="analytics-contract-filter"
              className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"
            >
              Contract
            </label>
            <Select
              value={contractId}
              onValueChange={(value) => setContractId(value ?? "all")}
            >
              <SelectTrigger id="analytics-contract-filter" className="w-full">
                <SelectValue placeholder="All contracts" />
              </SelectTrigger>
              <SelectContent align="start" className="w-[var(--anchor-width)]">
                <SelectItem value="all">All contracts</SelectItem>
                {baseAnalytics.contractOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="analytics-status-filter"
              className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"
            >
              Status
            </label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus((value as typeof status) ?? "ALL")
              }
            >
              <SelectTrigger id="analytics-status-filter" className="w-full">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent align="start" className="w-[var(--anchor-width)]">
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="FINALIZED">Finalized</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="analytics-date-from"
              className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"
            >
              Date from
            </label>
            <Input
              id="analytics-date-from"
              type="date"
              value={
                rangePreset === "custom"
                  ? customFrom
                  : toDateInputValue(activeRange.from ?? fullRangeStart)
              }
              min={toDateInputValue(fullRangeStart)}
              max={toDateInputValue(fullRangeEnd)}
              onChange={(event) => {
                setRangePreset("custom");
                setCustomFrom(event.target.value);
              }}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="analytics-date-to"
              className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"
            >
              Date to
            </label>
            <Input
              id="analytics-date-to"
              type="date"
              value={
                rangePreset === "custom"
                  ? customTo
                  : toDateInputValue(activeRange.to ?? fullRangeEnd)
              }
              min={toDateInputValue(fullRangeStart)}
              max={toDateInputValue(fullRangeEnd)}
              onChange={(event) => {
                setRangePreset("custom");
                setCustomTo(event.target.value);
              }}
            />
          </div>
        </div>

        <ChartCard
          title="Contract value over time"
          description={rangeDescription}
          controls={
            <ToggleGroup
              multiple={false}
              value={[rangePreset]}
              onValueChange={(value) => {
                const nextPreset =
                  (value[0] as RangePreset | undefined) ?? "all";
                setRangePreset(nextPreset);
                if (nextPreset === "all") {
                  setCustomFrom(toDateInputValue(fullRangeStart));
                  setCustomTo(toDateInputValue(fullRangeEnd));
                }
              }}
              variant="outline"
              spacing={0}
              className="hidden @[900px]/card:flex *:data-[slot=toggle-group-item]:px-4!"
            >
              <ToggleGroupItem value="all">Full range</ToggleGroupItem>
              <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
              <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
              <ToggleGroupItem value="180d">Last 6 months</ToggleGroupItem>
            </ToggleGroup>
          }
        >
          <div className="space-y-3" aria-busy={timelineIsFetching || undefined}>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Hover a point to inspect value, contracts, and line items.</span>
              {timelineIsFetching ? (
                <span className="font-medium text-foreground">Updating chart…</span>
              ) : null}
            </div>

            {timelinePoints.length > 0 ? (
              <ChartContainer
                config={timelineChartConfig}
                className={timelineIsFetching ? "aspect-auto h-[320px] w-full opacity-60 transition-opacity" : "aspect-auto h-[320px] w-full"}
              >
                <AreaChart
                  data={timelinePoints}
                  accessibilityLayer
                >
                  <defs>
                    <linearGradient
                      id="fillContractValue"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--color-contractValue)"
                        stopOpacity={0.65}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-contractValue)"
                        stopOpacity={0.08}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(value) =>
                      shortDateFormatter.format(
                        new Date(`${value}T00:00:00.000Z`),
                      )
                    }
                  />
                  <YAxis
                    width={72}
                    tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<TimelineTooltipContent />}
                  />
                  <Area
                    type="monotone"
                    dataKey="contractValue"
                    stroke="var(--color-contractValue)"
                    fill="url(#fillContractValue)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="grid min-h-56 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
                No contracts match the current filters.
              </div>
            )}

            {timelineIsError && timelinePoints.length > 0 ? (
              <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                <span>Could not refresh the chart. Showing the last successful data.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void refetchTimeline()}
                >
                  Try again
                </Button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>
              Filter:{" "}
              {contractId === "all"
                ? "All contracts"
                : baseAnalytics.contractOptions.find(
                    (option) => option.id === contractId,
                  )?.label ?? "Selected contract"}
            </span>
            <span>Status: {formatStatusLabel(status)}</span>
          </div>
        </ChartCard>
      </div>
    </section>
  );
}
