"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { LOCATION_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtDate } from "@/lib/format";
import { IconX, IconArrowRight } from "@/components/ui/Icons";

export interface MapLocation {
  id: string; code: string; zoneId: string; zoneName: string;
  aisle: string; rack: string; level: string; status: string;
  sku: string | null; description: string | null;
  qty: number; reserved: number; lot: string | null; expires: string | null;
  pallet: string | null; capacity: number; skuCount: number;
}

const FILL: Record<string, string> = {
  AVAILABLE: "bg-[#161A1B] border-[#262B2D] hover:border-[#3A4245]",
  OCCUPIED: "bg-[#1B2416] border-[#3C5722] hover:border-accent",
  RESERVED: "bg-[#241E12] border-[#5A451E] hover:border-warning",
  BLOCKED: "bg-[#241617] border-[#5C3437] hover:border-error",
  MOVING: "bg-[#131F2B] border-[#2C4A6B] hover:border-info",
};

/**
 * Mapa fisico do armazem: zona → corredor → modulo → nivel.
 * Cada celula e um endereco real; a cor reflete o status vindo do estoque.
 */
export function WarehouseMap({
  locations, zones,
}: {
  locations: MapLocation[];
  zones: { id: string; name: string; kind: string }[];
}) {
  const [selected, setSelected] = useState<MapLocation | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>("");

  const grouped = useMemo(() => {
    const visible = zoneFilter ? locations.filter((l) => l.zoneId === zoneFilter) : locations;
    const byZone = new Map<string, Map<string, MapLocation[]>>();
    for (const l of visible) {
      if (!byZone.has(l.zoneId)) byZone.set(l.zoneId, new Map());
      const aisles = byZone.get(l.zoneId)!;
      const key = l.aisle;
      if (!aisles.has(key)) aisles.set(key, []);
      aisles.get(key)!.push(l);
    }
    return byZone;
  }, [locations, zoneFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of locations) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [locations]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 items-start">
      <Card className="xl:col-span-3" padded={false}>
        <div className="p-5 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Layout fisico</h2>
            <p className="text-[12.5px] text-secondary mt-0.5 font-[family-name:var(--font-editorial)]">
              Zona · corredor · modulo · nivel
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="field w-auto" value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)} aria-label="Filtrar zona"
            >
              <option value="">Todas as zonas</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
        </div>

        <div className="px-5 pb-3 flex flex-wrap items-center gap-3">
          {Object.entries(LOCATION_STATUS_META).map(([key, meta]) => (
            <span key={key} className="flex items-center gap-1.5 text-[11.5px] text-secondary">
              <span className={`w-2.5 h-2.5 rounded-[3px] border ${FILL[key] ?? FILL.AVAILABLE}`} aria-hidden />
              {meta.label}
              <span className="text-faint tnum">({counts[key] ?? 0})</span>
            </span>
          ))}
        </div>

        <div className="px-5 pb-5 flex flex-col gap-5 max-h-[620px] overflow-y-auto">
          {[...grouped.entries()].map(([zoneId, aisles]) => {
            const zone = zones.find((z) => z.id === zoneId);
            return (
              <section key={zoneId}>
                <h3 className="label mb-2.5">{zone?.name ?? zoneId}</h3>
                <div className="flex flex-col gap-2.5">
                  {[...aisles.entries()].sort().map(([aisle, cells]) => (
                    <div key={aisle} className="flex items-start gap-3">
                      <span className="w-[74px] flex-none text-[11px] text-faint pt-1.5 font-[family-name:var(--font-editorial)]">
                        Corredor {aisle}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {cells
                          .slice()
                          .sort((a, b) => `${a.rack}${a.level}`.localeCompare(`${b.rack}${b.level}`))
                          .map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => setSelected(l)}
                              title={`${l.code}${l.sku ? ` · ${l.sku} · ${fmtNumber(l.qty)}` : " · livre"}`}
                              aria-label={`Endereco ${l.code}, ${LOCATION_STATUS_META[l.status as keyof typeof LOCATION_STATUS_META]?.label ?? l.status}`}
                              className={`w-[46px] h-[38px] rounded-[5px] border flex flex-col items-center justify-center transition-colors ${FILL[l.status] ?? FILL.AVAILABLE} ${
                                selected?.id === l.id ? "ring-1 ring-accent" : ""
                              }`}
                            >
                              <span className="text-[9.5px] text-faint leading-none font-[family-name:var(--font-mono)]">
                                {l.rack}·{l.level}
                              </span>
                              <span className="text-[11px] tnum leading-none mt-1 text-primary">
                                {l.qty > 0 ? fmtNumber(l.qty) : "—"}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {grouped.size === 0 && (
            <p className="text-[12.5px] text-faint py-8 text-center">Nenhum endereco corresponde ao filtro.</p>
          )}
        </div>
      </Card>

      {/* ---------------------------------------------------- painel lateral */}
      <Card className="sticky top-[76px]">
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <p className="eyebrow mb-1">{selected.zoneName}</p>
                <p className="text-[22px] font-[family-name:var(--font-display)] font-semibold leading-none">
                  {selected.code}
                </p>
              </div>
              <button
                type="button" className="btn btn-sm btn-ghost w-7 px-0"
                onClick={() => setSelected(null)} aria-label="Fechar detalhe"
              >
                <IconX size={13} />
              </button>
            </div>

            <Badge tone={(LOCATION_STATUS_META[selected.status as keyof typeof LOCATION_STATUS_META]?.tone) ?? "neutral"} dot>
              {LOCATION_STATUS_META[selected.status as keyof typeof LOCATION_STATUS_META]?.label ?? selected.status}
            </Badge>

            <dl className="flex flex-col gap-2.5 mt-4 text-[12.5px]">
              <Row label="Capacidade" value={`${fmtNumber(selected.capacity)} un`} />
              <Row label="Ocupacao" value={selected.qty > 0 ? `${fmtNumber(selected.qty)} un` : "vazio"} />
              <Row label="Reservado" value={selected.reserved > 0 ? `${fmtNumber(selected.reserved)} un` : "—"} />
              <Row
                label="SKU"
                value={selected.skuCount > 1 ? `${selected.sku} +${selected.skuCount - 1}` : (selected.sku ?? "—")}
                mono
              />
              <Row label="Produto" value={selected.description ?? "—"} />
              <Row label="Palete" value={selected.pallet ?? "—"} mono />
              <Row label="Lote" value={selected.lot ?? "—"} mono />
              <Row label="Validade" value={selected.expires ? fmtDate(selected.expires) : "—"} />
            </dl>

            <div className="flex flex-col gap-2 mt-5">
              <Link href={`/warehouse/${selected.id}`} className="btn btn-primary w-full">
                Abrir endereco <IconArrowRight size={13} />
              </Link>
              {selected.pallet && (
                <Link href={`/warehouse/pallets/${selected.pallet}`} className="btn w-full">
                  Ver palete {selected.pallet}
                </Link>
              )}
              <Link href={`/documents/location-label/${selected.id}`} className="btn w-full">
                Etiqueta do endereco
              </Link>
            </div>
          </>
        ) : (
          <div className="py-10 text-center">
            <p className="text-[13px] text-primary font-medium">Selecione um endereco</p>
            <p className="text-[12.5px] text-secondary mt-1.5 leading-relaxed">
              Clique em qualquer posicao do mapa para ver conteudo, lote, validade e historico de movimentacao.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="label flex-none">{label}</dt>
      <dd className={`text-right text-primary truncate ${mono ? "code" : ""}`} title={value}>{value}</dd>
    </div>
  );
}
