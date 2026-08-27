"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "vulpecula-ambient";

export type Ambient = "light" | "dim";

let current: Ambient = "light";
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "dim" || saved === "light") current = saved;
  } catch {}
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useAmbientTheme(): [Ambient, (next: Ambient) => void] {
  const ambient = useSyncExternalStore(
    subscribe,
    () => current,
    () => "light" as const,
  );

  const setAmbient = useCallback((next: Ambient) => {
    current = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    for (const listener of listeners) listener();
  }, []);

  return [ambient, setAmbient];
}
