import Topbar from "@/components/topbar";

const workflowSteps = [
  "import tradebook",
  "normalize rows",
  "match contracts",
  "review exceptions",
  "export evidence",
];

const consoleRows = [
  {
    name: "Master Services Agreement",
    owner: "Legal Ops",
    state: "Matched",
    metric: "98%",
  },
  {
    name: "Q4 Tradebook Upload",
    owner: "Trade Desk",
    state: "Review",
    metric: "14",
  },
  {
    name: "Pricing Schedule",
    owner: "Finance",
    state: "Clean",
    metric: "0",
  },
];

const features = [
  {
    title: "Contract metadata review",
    description:
      "Keep parties, dates, terms, schedules, and reference fields visible in one exacting review surface.",
  },
  {
    title: "Tradebook reconciliation",
    description:
      "Compare uploaded rows against contract records and spot the rows that need human attention.",
  },
  {
    title: "Exception queues",
    description:
      "Separate clean matches from missing terms, mismatched counterparties, and open review items.",
  },
  {
    title: "Audit-ready evidence",
    description:
      "Preserve the source row, review state, and resolution context needed for downstream checks.",
  },
  {
    title: "Import/export workflow",
    description:
      "Move from file intake to normalized outputs without losing track of what changed and why.",
  },
  {
    title: "Role-aware review",
    description:
      "Give legal, finance, and operations teams the same record with the right working context.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(31,124,168,0.10),transparent_34rem),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] text-foreground">
      <Topbar isLandingPage={true} />

      <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:pb-24 lg:pt-16">
        <div className="max-w-3xl">
          <p className="mb-5 inline-flex border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-normal text-primary">
            ContractView
          </p>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.96] tracking-normal text-zinc-950 sm:text-6xl lg:text-7xl">
            Contracts, trades, and evidence in one calm view
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
            ContractView is a focused operations console for reviewing contract
            metadata, tradebook rows, exceptions, and audit context without
            spreadsheet drift.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#workflow"
              className="inline-flex h-12 items-center justify-center border border-primary bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/85"
            >
              Open ContractView
            </a>
            <a
              href="#workflow"
              className="inline-flex h-12 items-center justify-center border border-zinc-200 bg-white px-5 text-sm font-bold text-zinc-950 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              View Workflow
            </a>
          </div>
        </div>

        <div className="border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-zinc-500">
                Review queue
              </p>
              <p className="text-sm font-bold text-zinc-950">
                Contract evidence map
              </p>
            </div>
            <span className="border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
              Live
            </span>
          </div>
          <div className="grid grid-cols-3 border-b border-zinc-200">
            {[
              ["Files", "24"],
              ["Matches", "92%"],
              ["Exceptions", "14"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border-r border-zinc-200 p-4 last:border-r-0"
              >
                <p className="text-xs font-medium text-zinc-500">{label}</p>
                <p className="mt-1 text-2xl font-black text-zinc-950">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="p-4">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-zinc-200 pb-2 text-xs font-bold uppercase tracking-normal text-zinc-500">
              <span>Record</span>
              <span>Status</span>
              <span>Signal</span>
            </div>
            <div className="divide-y divide-zinc-100">
              {consoleRows.map((row) => (
                <div
                  key={row.name}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 py-4 text-sm"
                >
                  <div>
                    <p className="font-bold text-zinc-950">{row.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{row.owner}</p>
                  </div>
                  <span className="h-fit border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                    {row.state}
                  </span>
                  <span className="font-black text-zinc-950">{row.metric}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="workflow"
        aria-label="ContractView workflow"
        className="mx-auto w-full max-w-6xl px-5 pb-14 sm:px-8"
      >
        <div className="border border-zinc-200 bg-zinc-950 p-4 font-mono text-sm text-zinc-100">
          <div className="mb-4 flex items-center justify-between gap-4 border-b border-white/10 pb-3">
            <span className="text-zinc-400">$ contractview run</span>
            <span className="text-primary-foreground">
              review-ready in one pass
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-5">
            {workflowSteps.map((step, index) => (
              <div
                key={step}
                className="border border-white/10 bg-white/[0.03] p-3"
              >
                <span className="text-zinc-500">0{index + 1}</span>
                <p className="mt-2 text-zinc-50">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="features"
        aria-label="ContractView features"
        className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8"
      >
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-normal text-primary">
              Features
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-normal text-zinc-950">
              Built for review teams that live between files and decisions
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-zinc-600">
            ContractView keeps the landing page honest: no hand-wavy AI claims,
            just the workflow surfaces operations teams expect.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="border border-zinc-200 bg-white p-5"
            >
              <h3 className="text-base font-black text-zinc-950">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <footer
        id="footer"
        className="border-t border-zinc-200 bg-white/75 px-5 py-8 sm:px-8 max-w-6xl mx-auto"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-4 text-sm text-zinc-600 sm:flex-row sm:items-center">
          <p>
            <span className="font-black text-zinc-950">ContractView</span> ·
            Contract and tradebook operations console
          </p>
          <div className="flex gap-5 font-medium">
            <a href="#features" className="hover:text-zinc-950">
              Features
            </a>
            <a href="#workflow" className="hover:text-zinc-950">
              Workflow
            </a>
            <a href="/sign-in" className="hover:text-zinc-950">
              Sign in
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
