"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { IconSearch, IconX } from "@/components/ui/Icons";

export interface FilterOption { value: string; label: string; }

/**
 * Barra de filtros sincronizada com a URL — o estado da tela e
 * compartilhavel e sobrevive ao recarregamento.
 */
export function FilterBar({
  searchKey = "search",
  placeholder = "Buscar…",
  selects = [],
  right,
}: {
  searchKey?: string;
  placeholder?: string;
  selects?: { key: string; label: string; options: FilterOption[] }[];
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(params.get(searchKey) ?? "");

  useEffect(() => { setTerm(params.get(searchKey) ?? ""); }, [params, searchKey]);

  function apply(next: URLSearchParams) {
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    apply(next);
  }

  useEffect(() => {
    const current = params.get(searchKey) ?? "";
    if (term === current) return;
    const t = setTimeout(() => setParam(searchKey, term), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const hasFilters = [...params.keys()].length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none">
          <IconSearch size={14} />
        </span>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="field pl-8 w-[230px]"
          spellCheck={false}
        />
      </div>

      {selects.map((s) => (
        <select
          key={s.key}
          value={params.get(s.key) ?? ""}
          onChange={(e) => setParam(s.key, e.target.value)}
          aria-label={s.label}
          className="field w-auto min-w-[140px]"
        >
          <option value="">{s.label}</option>
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}

      {hasFilters && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => apply(new URLSearchParams())}>
          <IconX size={12} /> Limpar
        </button>
      )}

      {pending && <span className="text-[11.5px] text-faint">atualizando…</span>}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}
