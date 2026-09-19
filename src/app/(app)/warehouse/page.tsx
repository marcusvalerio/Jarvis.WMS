import Link from "next/link";
import type { Metadata } from "next";
import { locationMap, occupancy, listZones } from "@/domain/services/warehouse";
import { PageHeader, Card, CardHeader, Metric, Progress } from "@/components/ui/Primitives";
import { WarehouseMap } from "./map";
import { LOCATION_STATUS_META } from "@/domain/states";
import { fmtPercent, fmtNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Mapa do armazem" };
export const dynamic = "force-dynamic";

export default async function WarehousePage({
  searchParams,
}: { searchParams: Promise<{ zone?: string; status?: string; search?: string }> }) {
  const sp = await searchParams;
  const zones = listZones().filter((z) => ["PICKING", "STORAGE"].includes(z.kind));
  const locations = locationMap({ zoneId: sp.zone, status: sp.status, search: sp.search })
    .filter((l) => l.kind === "PALLET");
  const occ = occupancy();

  return (
    <>
      <PageHeader
        eyebrow="Armazem"
        title="Mapa do armazem"
        description="Cada posicao-palete com ocupacao, SKU, lote e validade. Clique em um endereco para ver o conteudo e o historico."
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Posicoes" value={fmtNumber(occ.totalPositions)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Ocupadas" value={fmtNumber(occ.occupied)} tone="accent" size="sm" /></Card>
        <Card className="p-4"><Metric label="Livres" value={fmtNumber(occ.available)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Reservadas" value={fmtNumber(occ.reserved)} tone="warning" size="sm" /></Card>
        <Card className="p-4"><Metric label="Ocupacao" value={fmtPercent(occ.occupancyPct, 1)} tone="accent" size="sm" /></Card>
      </div>

      <WarehouseMap
        locations={locations.map((l) => ({
          id: l.id, code: l.code, zoneId: l.zone_id, zoneName: l.zone_name,
          aisle: l.aisle, rack: l.rack, level: l.level, status: l.status,
          sku: l.sku, description: l.description, qty: l.qty, reserved: l.reserved,
          lot: l.lot_code, expires: l.expires_at, pallet: l.pallet_id,
          capacity: l.capacity_units, skuCount: l.sku_count,
        }))}
        zones={zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind }))}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5 items-start">
        {occ.byZone.map((z) => (
          <Card key={z.zoneId}>
            <CardHeader title={z.zoneName} subtitle={`${z.occupied} de ${z.total} posicoes ocupadas`} />
            <Progress value={z.occupied} max={z.total} tone={z.pct > 90 ? "warning" : "accent"} height={6} />
            <p className="text-[24px] font-[family-name:var(--font-display)] font-semibold tnum mt-3">
              {fmtPercent(z.pct, 1)}
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}
