"use client";

import type { ComponentProps } from "react";

import { useDebouncedCommit } from "@/hooks/use-debounced-value";
import { Input } from "@/components/ui/input";

interface DebouncedInputProps
  extends Omit<ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string;
  onCommit: (value: string) => void;
  delayMs?: number;
}

export function DebouncedInput({
  value,
  onCommit,
  delayMs = 300,
  ...props
}: DebouncedInputProps) {
  const { draft, setDraft } = useDebouncedCommit(value, onCommit, delayMs);

  return (
    <Input {...props} value={draft} onChange={(event) => setDraft(event.target.value)} />
  );
}
