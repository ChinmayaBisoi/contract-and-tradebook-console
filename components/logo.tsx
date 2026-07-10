import Link from "next/link";

export default function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3"
      aria-label="ContractView home"
    >
      <span className="flex size-8 items-center justify-center border border-primary/25 bg-primary text-sm font-black text-primary-foreground">
        CV
      </span>
      <span className="text-base font-black tracking-normal text-zinc-950">
        ContractView
      </span>
    </Link>
  );
}
