"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NAV } from "./nav";
import { IconSearch, IconArrowRight, IconScan } from "@/components/ui/Icons";

export interface SearchHit {
  kind: string;
  kindLabel: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  status?: string;
}

const PAGES = NAV.flatMap((g) =>
  g.items.map((i) => ({
    kind: "PAGE", kindLabel: g.label, id: i.href,
    title: i.label, subtitle: i.href, href: i.href,
  })),
);

/**
 * Busca global. Aceita tanto texto quanto uma LEITURA DE COLETORA:
 * se o valor digitado/bipado resolver para uma entidade, a navegacao e
 * imediata — o mesmo campo serve ao teclado e ao leitor HID.
 */
export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        setHits(data.hits ?? []);
        setCursor(0);
      } catch { /* requisicao substituida */ }
    }, 120);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const pageHits = query.trim().length >= 2
    ? PAGES.filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 4)
    : PAGES.slice(0, 7);

  const results: SearchHit[] = [
    ...hits,
    ...pageHits.map((p) => ({ ...p, kindLabel: "Ir para" })) as SearchHit[],
  ];

  function go(hit: SearchHit) {
    setOpen(false);
    startTransition(() => router.push(hit.href));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-md border border-border bg-bg text-secondary hover:border-[#363D3F] hover:text-primary transition-colors w-[210px] xl:w-[280px]"
        aria-label="Busca global e leitura de codigo"
      >
        <IconSearch size={14} />
        <span className="text-[12.5px] truncate font-[family-name:var(--font-editorial)]">
          Buscar ou bipar codigo
        </span>
        <kbd className="ml-auto text-[10px] px-1.5 h-[18px] leading-[18px] rounded bg-elevated border border-border text-faint">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-start justify-center pt-[12vh] px-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-xl card-elevated overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Busca global"
          >
            <div className="flex items-center gap-2.5 px-4 h-12 border-b border-border">
              <span className="text-accent flex-none"><IconScan size={16} /></span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(c + 1, results.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  }
                  if (e.key === "Enter" && results[cursor]) {
                    e.preventDefault();
                    go(results[cursor]);
                  }
                }}
                placeholder="SKU, palete, endereco, pedido, volume, romaneio…"
                className="flex-1 bg-transparent border-0 outline-none text-[14px] text-primary placeholder:text-faint"
                autoComplete="off"
                spellCheck={false}
              />
              {pending && <span className="text-[11px] text-faint">abrindo…</span>}
            </div>

            <ul className="max-h-[52vh] overflow-y-auto py-1.5" role="listbox">
              {results.length === 0 && (
                <li className="px-4 py-8 text-center text-[12.5px] text-faint">
                  {query.trim().length < 2
                    ? "Digite ao menos 2 caracteres ou bipe um codigo."
                    : `Nada encontrado para "${query}".`}
                </li>
              )}
              {results.map((hit, i) => (
                <li key={`${hit.kind}-${hit.id}-${i}`} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(hit)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                      i === cursor ? "bg-[#1F2426]" : ""
                    }`}
                  >
                    <span className="w-[76px] flex-none eyebrow truncate">{hit.kindLabel}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-primary truncate">{hit.title}</span>
                      {hit.subtitle && (
                        <span className="block text-[11.5px] text-faint truncate">{hit.subtitle}</span>
                      )}
                    </span>
                    <span className={i === cursor ? "text-accent" : "text-faint"}>
                      <IconArrowRight size={14} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-4 px-4 h-9 border-t border-border text-[11px] text-faint">
              <span>↑↓ navegar</span>
              <span>↵ abrir</span>
              <span>esc fechar</span>
              <span className="ml-auto">Leitor USB: bipe e pressione Enter</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
