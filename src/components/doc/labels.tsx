import { Barcode } from "@/components/Barcode";
import { fmtNumber, fmtDate, fmtWeight, fmtDimensions } from "@/lib/format";
import { WAREHOUSE } from "@/seed/scenario";

/**
 * Etiquetas fisicas. Formato 100 x 150 mm (padrao de impressora termica),
 * com o codigo de barras carregando exatamente o identificador do sistema.
 */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <article
      className="doc-sheet bg-white text-black mx-auto my-6 p-[6mm] shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_18px_40px_rgba(0,0,0,0.45)] flex flex-col"
      style={{ width: "100mm", minHeight: "150mm", fontFamily: "var(--font-sora)" }}
    >
      {children}
    </article>
  );
}

function LabelHeader({ kind }: { kind: string }) {
  return (
    <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-2.5">
      <span className="text-[9pt] font-bold tracking-[0.1em]" style={{ fontFamily: "var(--font-familjen)" }}>
        JARVIS WMS
      </span>
      <span className="text-[7.5pt] tracking-[0.14em] uppercase">{kind}</span>
    </div>
  );
}

function Line({ label, value, big = false }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-[3px] border-b border-[#DDD]">
      <span className="text-[6.8pt] tracking-[0.1em] uppercase text-[#555] w-[24mm] flex-none">{label}</span>
      <span className={`${big ? "text-[13pt] font-bold" : "text-[9pt]"} leading-tight break-words`}>
        {value || "—"}
      </span>
    </div>
  );
}

// -------------------------------------------------------------- palete
export function PalletLabel({ pallet, items }: { pallet: any; items: any[] }) {
  return (
    <Label>
      <LabelHeader kind="Etiqueta de palete" />
      <p className="text-[28pt] font-bold leading-none text-center my-1" style={{ fontFamily: "var(--font-familjen)" }}>
        {pallet.id}
      </p>
      <div className="flex justify-center my-2">
        <Barcode value={pallet.id} height={64} moduleWidth={2.1} fontSize={9} />
      </div>

      <div className="mt-1">
        {items.map((i: any) => (
          <div key={i.id} className="border border-black p-1.5 mb-1.5">
            <p className="text-[12pt] font-bold leading-none">{i.sku}</p>
            <p className="text-[8pt] leading-snug mt-0.5">{i.description}</p>
            <div className="flex justify-between mt-1.5 text-[9pt]">
              <span><b>{fmtNumber(i.quantity)}</b> {i.unit}</span>
              <span>Lote {i.lot_code ?? "—"}</span>
              <span>Val. {i.expires_at ? fmtDate(i.expires_at) : "—"}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto">
        <Line label="Origem" value={pallet.origin_ref ?? pallet.origin_kind} />
        <Line label="Endereco" value={pallet.location_code ?? "aguardando"} big />
        <Line label="Peso liquido" value={fmtWeight(pallet.net_weight_kg, 2)} />
        <Line label="Peso bruto" value={fmtWeight(pallet.gross_weight_kg, 2)} />
        <Line label="Montado em" value={fmtDate(pallet.created_at)} />
        <p className="text-[6.5pt] text-center mt-2 text-[#666]">{WAREHOUSE.tradeName}</p>
      </div>
    </Label>
  );
}

// -------------------------------------------------------------- endereco
export function LocationLabel({ location }: { location: any }) {
  return (
    <Label>
      <LabelHeader kind="Etiqueta de endereco" />
      <p className="text-[42pt] font-bold leading-none text-center my-4 tracking-tight" style={{ fontFamily: "var(--font-familjen)" }}>
        {location.code}
      </p>
      <div className="flex justify-center my-3">
        <Barcode value={location.id} height={74} moduleWidth={2.3} fontSize={10} />
      </div>
      <div className="mt-3">
        <Line label="Zona" value={location.zone_name} />
        <Line label="Corredor" value={location.aisle} />
        <Line label="Modulo" value={location.rack} />
        <Line label="Nivel" value={location.level} />
        <Line label="Capacidade" value={`${fmtNumber(location.capacity_units)} un · ${location.capacity_pallets} palete(s)`} />
        <Line label="Peso maximo" value={fmtWeight(location.max_weight_kg, 0)} />
        <Line label="Rota de picking" value={location.pick_sequence} />
      </div>
      <p className="text-[6.5pt] text-center mt-auto text-[#666]">{WAREHOUSE.tradeName}</p>
    </Label>
  );
}

// -------------------------------------------------------------- volume
export function VolumeLabel({ volume, items }: { volume: any; items: any[] }) {
  return (
    <Label>
      <LabelHeader kind="Etiqueta de volume" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[24pt] font-bold leading-none" style={{ fontFamily: "var(--font-familjen)" }}>
            {volume.id}
          </p>
          <p className="text-[8.5pt] mt-1">Volume {volume.sequence} · {volume.container_kind}</p>
        </div>
        <div className="text-right">
          <p className="text-[6.8pt] tracking-[0.1em] uppercase text-[#555]">Pedido</p>
          <p className="text-[12pt] font-bold leading-tight">{volume.sales_order_id}</p>
        </div>
      </div>

      <div className="flex justify-center my-3">
        <Barcode value={volume.id} height={62} moduleWidth={2.1} fontSize={9} />
      </div>

      <div className="border-2 border-black p-2 mb-2">
        <p className="text-[6.8pt] tracking-[0.1em] uppercase text-[#555]">Destinatario</p>
        <p className="text-[11pt] font-bold leading-tight">{volume.customer_name}</p>
        <p className="text-[8pt] leading-snug mt-0.5">{volume.customer_address}</p>
        <p className="text-[8pt] leading-snug">
          {volume.customer_city}/{volume.customer_state} — CEP {volume.customer_zip}
        </p>
      </div>

      <table className="w-full border-collapse text-[8pt] mb-2">
        <thead>
          <tr className="bg-[#EDEDED]">
            <th className="border border-[#999] px-1 py-0.5 text-left text-[6.8pt] uppercase">SKU</th>
            <th className="border border-[#999] px-1 py-0.5 text-left text-[6.8pt] uppercase">Lote</th>
            <th className="border border-[#999] px-1 py-0.5 text-right text-[6.8pt] uppercase">Qtd</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i: any) => (
            <tr key={i.id}>
              <td className="border border-[#999] px-1 py-0.5">{i.sku}</td>
              <td className="border border-[#999] px-1 py-0.5">{i.lot_code ?? "—"}</td>
              <td className="border border-[#999] px-1 py-0.5 text-right tnum">{fmtNumber(i.quantity)} {i.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-auto">
        <Line label="Dimensoes" value={fmtDimensions(volume.length_cm, volume.width_cm, volume.height_cm)} />
        <Line label="Peso liquido" value={fmtWeight(volume.net_weight_kg, 3)} />
        <Line label="Peso bruto" value={fmtWeight(volume.gross_weight_kg, 3)} big />
        <Line label="Transportadora" value={volume.carrier ?? "—"} />
      </div>
    </Label>
  );
}

// -------------------------------------------------------------- produto
export function ProductLabel({ product, barcodes }: { product: any; barcodes: any[] }) {
  const primary = barcodes.find((b: any) => b.is_primary) ?? barcodes[0];
  return (
    <Label>
      <LabelHeader kind="Etiqueta de produto" />
      <p className="text-[30pt] font-bold leading-none text-center my-2" style={{ fontFamily: "var(--font-familjen)" }}>
        {product.sku}
      </p>
      <p className="text-[10pt] text-center leading-snug px-2 mb-2">{product.description}</p>

      <div className="flex justify-center my-2">
        <Barcode value={primary?.code ?? product.sku} height={66} moduleWidth={2.1} fontSize={9} />
      </div>

      <div className="mt-2">
        <Line label="Categoria" value={product.category} />
        <Line label="Unidade" value={product.unit} />
        <Line label="Classe ABC" value={product.abc_class} />
        <Line label="NCM" value={product.ncm ?? "—"} />
        <Line label="Peso unitario" value={fmtWeight(product.unit_gross_kg, 3)} />
        <Line label="Dimensoes" value={fmtDimensions(product.length_cm, product.width_cm, product.height_cm)} />
        <Line label="Un. por palete" value={fmtNumber(product.units_per_pallet)} />
      </div>

      {barcodes.length > 1 && (
        <div className="mt-3">
          <p className="text-[6.8pt] tracking-[0.1em] uppercase text-[#555] mb-1">Codigo do fabricante</p>
          <div className="flex justify-center">
            <Barcode value={barcodes.find((b: any) => !b.is_primary)!.code} height={40} moduleWidth={1.6} fontSize={8} />
          </div>
        </div>
      )}

      <p className="text-[6.5pt] text-center mt-auto text-[#666]">{WAREHOUSE.tradeName}</p>
    </Label>
  );
}
