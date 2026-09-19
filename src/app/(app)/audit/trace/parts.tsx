"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { IconScan } from "@/components/ui/Icons";

/** Aceita digitacao ou leitura direta da coletora (Enter no fim do codigo). */
export function TraceSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (!q) return;
        startTransition(() => router.push(`/audit/trace?q=${encodeURIComponent(q)}`));
      }}
      className="flex items-end gap-2"
    >
      <label className="flex-1">
        <span className="label block mb-1.5">Identificador ou leitura de codigo</span>
        <span className="relative block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-fg pointer-events-none">
            <IconScan size={16} />
          </span>
          <input
            ref={ref} value={value} onChange={(e) => setValue(e.target.value)}
            className="field pl-9 h-11 code text-[15px]"
            placeholder="SKU-001 · PLT-000001 · PED-000125 · OR-000001 · NFS-000001"
            autoComplete="off" spellCheck={false} autoFocus
          />
        </span>
      </label>
      <button type="submit" className="btn btn-primary h-11" disabled={pending}>
        {pending ? "Buscando…" : "Rastrear"}
      </button>
    </form>
  );
}
