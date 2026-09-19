"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { IconPrint, IconSearch, IconChevron } from "@/components/ui/Icons";

export interface DocPanel {
  type: string; label: string; group: string; description: string;
  format: string; simulated: boolean;
  items: { id: string; label: string; sublabel?: string; status?: string }[];
}

const SHOW = 6;

export function DocTypePanel({ doc }: { doc: DocPanel }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const filtered = query.trim()
    ? doc.items.filter((i) =>
        `${i.label} ${i.sublabel ?? ""} ${i.id}`.toLowerCase().includes(query.trim().toLowerCase()))
    : doc.items;
  const shown = expanded ? filtered : filtered.slice(0, SHOW);

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-primary">{doc.label}</h3>
          <p className="text-[12px] text-secondary mt-1 leading-snug">{doc.description}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-none">
          <Badge tone={doc.format === "ETIQUETA" ? "info" : "neutral"}>
            {doc.format === "ETIQUETA" ? "Etiqueta" : "A4"}
          </Badge>
          {doc.simulated && <Badge tone="warning">Simulado</Badge>}
        </div>
      </div>

      {doc.items.length === 0 ? (
        <p className="text-[12.5px] text-faint mt-3 py-4 text-center border border-dashed border-border rounded-md">
          Nenhum documento deste tipo ainda — sera gerado quando a operacao avancar.
        </p>
      ) : (
        <>
          {doc.items.length > SHOW && (
            <div className="relative mt-3">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none">
                <IconSearch size={13} />
              </span>
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filtrar ${doc.items.length} documentos…`}
                aria-label={`Filtrar ${doc.label}`}
                className="field pl-8 h-8 text-[12.5px]"
              />
            </div>
          )}

          <ul className="flex flex-col gap-px mt-3">
            {shown.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/documents/${doc.type}/${encodeURIComponent(i.id)}`}
                  className="flex items-center gap-2.5 h-9 px-2 -mx-1 rounded-md hover:bg-elevated transition-colors group"
                >
                  <span className="text-faint group-hover:text-accent-fg flex-none"><IconPrint size={13} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-primary truncate">{i.label}</span>
                    {i.sublabel && <span className="block text-[11px] text-faint truncate">{i.sublabel}</span>}
                  </span>
                  {i.status && <span className="text-[10.5px] text-faint flex-none">{i.status}</span>}
                </Link>
              </li>
            ))}
          </ul>

          {filtered.length > SHOW && (
            <button
              type="button"
              className="btn btn-sm btn-ghost mt-2 self-start"
              onClick={() => setExpanded((v) => !v)}
            >
              <IconChevron size={12} className={expanded ? "-rotate-90" : "rotate-90"} />
              {expanded ? "Mostrar menos" : `Ver todos (${filtered.length})`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
