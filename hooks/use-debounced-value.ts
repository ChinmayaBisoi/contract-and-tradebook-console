"use client";

import { useEffect, useRef, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

export function useDebouncedCommit(
  value: string,
  onCommit: (value: string) => void,
  delayMs = 300,
) {
  const [draft, setDraft] = useState(value);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) {
      return;
    }

    const timeout = window.setTimeout(() => onCommitRef.current(draft), delayMs);
    return () => window.clearTimeout(timeout);
  }, [draft, value, delayMs]);

  return { draft, setDraft };
}
