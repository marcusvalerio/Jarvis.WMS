import type { ReactNode } from "react";
import { Barcode } from "@/components/Barcode";
import { fmtNumber, fmtDate, fmtWeight } from "@/lib/format";
import { WAREHOUSE } from "@/seed/scenario";
import { PALLET_STATUS_META, type PalletStatus } from "@/domain/states";

/**
 * FOLHA A4 DE ETIQUETAS — 2 colunas x 3 linhas = 6 por folha.
 *
 * Geometria (A4 retrato, 210 x 297 mm):
 *   margem da folha ......... 10 mm em volta  -> area util 190 x 277 mm
 *   espaco entre etiquetas ... 4 mm
 *   celula ................... 93 x 86 mm
 *
 * A conta da altura fecha dentro da folha, e e por isso que a celula tem
 * 86 mm e nao 90: 3 x 86 + 2 x 4 de espaco = 266 mm, mais a linha de
 * rodape, cabem nos 277 mm uteis. Com celulas maiores a terceira fileira
 * transbordaria e cada folha sairia com uma pagina em branco atras.
 *
 * A folha imprime em tamanho real: o PDF sai com margem zero e a medida
 * vem daqui, em milimetros, entao nao depende de "ajustar a pagina" na
 * caixa de dialogo da impressora. Cada pagina e uma `.doc-sheet`, que o CSS
 * de impressao ja quebra com `page-break-after`.
 *
 * O numero de paginas e ceil(total / 6) — sem buraco: a proxima etiqueta
 * ocupa sempre a proxima posicao livre da grade.
 */
export const LABELS_PER_SHEET = 6;

/** Altura fixa da celula. Conteudo nunca e reduzido para caber: a celula
 *  e que foi dimensionada para o conteudo da etiqueta. */
const CELL_HEIGHT = "86mm";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function LabelSheet<T>({
  items, render, title, keyOf,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  /** Titulo do conjunto, impresso discretamente no rodape de cada folha. */
  title: string;
  keyOf: (item: T) => string;
}) {
  const pages = chunk(items, LABELS_PER_SHEET);
  if (pages.length === 0) {
    return (
      <article
        className="doc-sheet bg-white text-black mx-auto my-6 p-[10mm] shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_18px_40px_rgba(0,0,0,0.45)]"
        style={{ width: "210mm", minHeight: "297mm", fontFamily: "var(--font-sora)" }}
      >
        <p className="text-[10pt]">Nenhuma etiqueta deste tipo no cenario carregado.</p>
      </article>
    );
  }

  return (
    <>
      {pages.map((page, p) => (
        <article
          key={p}
          className="doc-sheet bg-white text-black mx-auto my-6 p-[10mm] flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_18px_40px_rgba(0,0,0,0.45)]"
          style={{ width: "210mm", minHeight: "297mm", fontFamily: "var(--font-sora)" }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(2, 1fr)",
              gridAutoRows: CELL_HEIGHT,
              gap: "4mm",
            }}
          >
            {page.map((item) => (
              <div key={keyOf(item)} className="avoid-break">{render(item)}</div>
            ))}
          </div>
          <p className="mt-auto pt-[3mm] text-[6.5pt] text-[#777] flex justify-between">
            <span>{WAREHOUSE.tradeName} · {title}</span>
            <span>Folha {p + 1} de {pages.length} · imprimir em A4, escala 100%</span>
          </p>
        </article>
      ))}
    </>
  );
}

/** Moldura da celula — borda de corte e recuo interno. */
function Cell({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <div
      className="border border-black h-full w-full px-[3mm] py-[2.5mm] flex flex-col overflow-hidden"
      style={{ boxSizing: "border-box" }}
    >
      <p className="text-[6pt] tracking-[0.16em] uppercase text-[#555] leading-none mb-[1mm]">
        {kind}
      </p>
      {children}
    </div>
  );
}

/**
 * Codigo de barras da celula.
 * moduleWidth 1.8 px = 0,476 mm de barra estreita — bem acima do minimo
 * que um leitor Code 128 exige, e estreito o bastante para os 10 caracteres
 * de VOL-000011 caberem nos 87 mm uteis da celula. A altura usa a folga
 * que sobrava na celula: barra mais alta e mais facil de mirar na doca.
 */
function CellBarcode({ value }: { value: string }) {
  return (
    <div className="flex justify-center my-[1.5mm]">
      <Barcode value={value} height={58} moduleWidth={1.8} fontSize={8} quietZone={8} />
    </div>
  );
}

function Campo({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p className="text-[7pt] leading-[1.35]">
      <span className="text-[#555]">{label}: </span>
      <b>{value || "—"}</b>
    </p>
  );
}

// ------------------------------------------------------- caixa de saida
export function VolumeCell({ volume, items }: { volume: any; items: any[] }) {
  const total = items.reduce((s, i) => s + Number(i.quantity), 0);
  return (
    <Cell kind="Volume · expedicao">
      <div className="flex items-baseline justify-between gap-1">
        <p className="text-[15pt] font-bold leading-none" style={{ fontFamily: "var(--font-familjen)" }}>
          {volume.id}
        </p>
        <p className="text-[7.5pt] font-bold">
          CAIXA {String(volume.sequence).padStart(2, "0")}
          {volume.order_volumes ? `/${String(volume.order_volumes).padStart(2, "0")}` : ""}
        </p>
      </div>

      <CellBarcode value={volume.id} />

      <Campo label="Pedido" value={volume.sales_order_id} />
      <Campo
        label="Destino"
        value={`${volume.customer_trade ?? volume.customer_name} · ${volume.customer_city}/${volume.customer_state}`}
      />

      <p className="text-[6.5pt] text-[#555] mt-[1.2mm] leading-none">Conteudo</p>
      <ul className="text-[7pt] leading-[1.3]">
        {items.map((i: any) => (
          <li key={i.id}>
            <b>{fmtNumber(i.quantity)} ×</b> {i.description}
            {i.lot_code ? <span className="text-[#555]"> · lote {i.lot_code}</span> : null}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-[1mm]">
        <p className="text-[7.5pt] font-bold leading-tight">
          Total: {fmtNumber(total)} unidades · {fmtWeight(volume.gross_weight_kg, 3)}
        </p>
        {/* Sem romaneio ainda, a etiqueta simplesmente nao exibe a rota em
            vez de inventar um destino de carga. */}
        {volume.route && (
          <div className="border-t border-black mt-[1mm] pt-[1mm]">
            <p className="text-[7pt] font-bold uppercase leading-tight truncate">{volume.route}</p>
            <p className="text-[7pt] text-[#555] leading-tight">
              {volume.manifest_id} · {volume.vehicle_plate ?? "—"}
              {volume.stop_sequence != null ? ` · parada ${String(volume.stop_sequence).padStart(2, "0")}` : ""}
            </p>
          </div>
        )}
      </div>
    </Cell>
  );
}

// ----------------------------------------------------- caixa de entrada
export function InboundVolumeCell({ volume, items }: { volume: any; items: any[] }) {
  const total = items.reduce((s, i) => s + Number(i.quantity), 0);
  return (
    <Cell kind="Caixa recebida">
      <div className="flex items-baseline justify-between gap-1">
        <p className="text-[15pt] font-bold leading-none" style={{ fontFamily: "var(--font-familjen)" }}>
          {volume.id}
        </p>
        <p className="text-[7.5pt] font-bold">
          CAIXA {String(volume.sequence).padStart(2, "0")}
          {volume.inbound_volumes ? `/${String(volume.inbound_volumes).padStart(2, "0")}` : ""}
        </p>
      </div>

      <CellBarcode value={volume.id} />

      <Campo label="Recebimento" value={volume.inbound_order_id} />
      <Campo label="Fornecedor" value={volume.supplier_name} />
      <Campo
        label="NF de entrada"
        value={`${volume.invoice_number ?? volume.invoice_id ?? "—"}${volume.purchase_order_id ? ` · ${volume.purchase_order_id}` : ""}`}
      />

      <p className="text-[6.5pt] text-[#555] mt-[1.2mm] leading-none">Conteudo</p>
      <ul className="text-[7pt] leading-[1.3]">
        {items.map((i: any) => (
          <li key={i.id}>
            <b>{fmtNumber(i.quantity)} ×</b> {i.description}
            {i.lot_code ? <span className="text-[#555]"> · lote {i.lot_code}</span> : null}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-[1mm]">
        <p className="text-[7.5pt] font-bold leading-tight">
          Total: {fmtNumber(total)} unidades · {fmtWeight(volume.gross_weight_kg, 3)}
        </p>
        <div className="border-t border-black mt-[1mm] pt-[1mm] flex gap-2">
          <span className="text-[6pt] text-[#555] uppercase tracking-[0.1em]">Conferido por</span>
          <span className="flex-1 border-b border-black" />
        </div>
      </div>
    </Cell>
  );
}

// --------------------------------------------------------------- palete
export function PalletCell({ pallet, items }: { pallet: any; items: any[] }) {
  const unidades = items.reduce((s, i) => s + Number(i.quantity), 0);
  return (
    <Cell kind="Palete">
      <div className="flex items-baseline justify-between gap-1">
        <p className="text-[15pt] font-bold leading-none" style={{ fontFamily: "var(--font-familjen)" }}>
          {pallet.id}
        </p>
        <p className="text-[7.5pt] font-bold uppercase">{pallet.kind}</p>
      </div>

      <CellBarcode value={pallet.id} />

      <Campo
        label="Status"
        value={PALLET_STATUS_META[pallet.status as PalletStatus]?.label ?? pallet.status}
      />
      <Campo
        label="Localizacao"
        value={pallet.location_code
          ? `${pallet.location_code}${pallet.zone_name ? ` · ${pallet.zone_name}` : ""}`
          : "aguardando enderecamento"}
      />
      {/* Caixas so existem quando o palete veio de um recebimento
          etiquetado; no palete de estoque inicial nao ha caixa atras. */}
      <Campo
        label="Caixas"
        value={Number(pallet.box_count) > 0
          ? `${pallet.box_count} (${pallet.origin_ref})`
          : `sem caixa · origem ${pallet.origin_ref ?? pallet.origin_kind}`}
      />

      <p className="text-[6.5pt] text-[#555] mt-[1.2mm] leading-none">Conteudo</p>
      <ul className="text-[7pt] leading-[1.3]">
        {items.map((i: any) => (
          <li key={i.id}>
            <b>{fmtNumber(i.quantity)} {i.unit}</b> · {i.description}
            {i.lot_code ? <span className="text-[#555]"> · lote {i.lot_code}</span> : null}
            {i.expires_at ? <span className="text-[#555]"> · val. {fmtDate(i.expires_at)}</span> : null}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-[1mm] border-t border-black">
        <p className="text-[7.5pt] font-bold leading-tight">
          {fmtNumber(unidades)} unidades · bruto {fmtWeight(pallet.gross_weight_kg, 2)}
        </p>
      </div>
    </Cell>
  );
}

// ---------------------------------------------------------- localizacao
export function LocationCell({ location }: { location: any }) {
  return (
    <Cell kind="Localizacao">
      <div className="flex items-baseline justify-between gap-1">
        <p className="text-[15pt] font-bold leading-none" style={{ fontFamily: "var(--font-familjen)" }}>
          {location.code}
        </p>
        <p className="text-[7.5pt] font-bold uppercase">{location.zone_kind}</p>
      </div>

      <CellBarcode value={location.id} />

      <Campo label="Zona" value={location.zone_name} />
      <Campo label="Endereco" value={location.code} />

      <div className="mt-auto pt-[1mm] border-t border-black">
        <p className="text-[6.5pt] text-[#555] leading-tight">
          Placa de porta-palete — o codigo lido pela coletora e o proprio endereco.
        </p>
      </div>
    </Cell>
  );
}

// -------------------------------------------------------------- produto
export function ProductCell({ product, barcodes }: { product: any; barcodes: any[] }) {
  // O codigo interno e o que a coletora resolve; o EAN vem impresso na
  // embalagem do fabricante e entra so como referencia visual.
  const interno = barcodes.find((b: any) => b.is_primary) ?? barcodes[0];
  const ean = barcodes.find((b: any) => b.kind === "EAN13") ?? null;
  return (
    <Cell kind="Produto">
      <div className="flex items-baseline justify-between gap-1">
        <p className="text-[15pt] font-bold leading-none" style={{ fontFamily: "var(--font-familjen)" }}>
          {product.sku}
        </p>
        <p className="text-[7.5pt] font-bold uppercase">{product.unit}</p>
      </div>

      <CellBarcode value={interno?.code ?? product.sku} />

      <p className="text-[8pt] font-bold leading-[1.25] mb-[1mm]">{product.description}</p>
      <Campo label="Codigo interno" value={interno?.code ?? product.sku} />
      <Campo label="EAN do fabricante" value={ean?.code ?? "—"} />
      <Campo label="NCM" value={product.ncm} />
      <Campo label="Peso bruto unitario" value={fmtWeight(product.unit_gross_kg, 3)} />
      <Campo label="Unidades por palete" value={fmtNumber(product.units_per_pallet)} />

      <div className="mt-auto pt-[1mm] border-t border-black">
        <p className="text-[6.5pt] text-[#555] leading-tight">
          O codigo de barras carrega o identificador interno, nao o EAN: e ele que a
          coletora resolve.
        </p>
      </div>
    </Cell>
  );
}
