"use client";

import { useEffect } from "react";

export function AutoPrint({ enabled = false }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => window.print(), 700);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  return null;
}
