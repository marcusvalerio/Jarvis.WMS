import {
  Sheet, DocHeader, DocSection, DocFields, DocTable, Td, DocTotals,
  DocSignatures, DocFooter, fmtCnpj, fmtAccessKey,
} from "./Sheet";
import { Barcode } from "@/components/Barcode";
import { fmtNumber, fmtMoney, fmtWeight, fmtDate, fmtDateTime, fmtDimensions } from "@/lib/format";
import { WAREHOUSE } from "@/seed/scenario";

// ============================================================ pedido de venda
export function SalesOrderDoc({ order, items }: { order: any; items: any[] }) {
  return (
    <Sheet>
      <DocHeader
        title="Pedido de venda" number={order.id} issuedAt={order.issued_at} code={order.id}
        subtitle={`Prazo de entrega ${fmtDateTime(order.due_at)} · prioridade ${order.priority}`}
        extra={
          <DocFields cols={3} fields={[
            { label: "Cliente", value: <><b>{order.customer_name}</b><br />CNPJ {fmtCnpj(order.customer_cnpj)}</> },
            { label: "Endereco de entrega", value: `${order.ship_to_address ?? ""} — ${order.ship_to_city}/${order.ship_to_state} — CEP ${order.ship_to_zip ?? "—"}` },
            { label: "Transportadora", value: order.carrier ?? "—" },
          ]} />
        }
      />

      <DocSection title="Itens do pedido">
        <DocTable head={[
          { label: "Item", width: "8mm", align: "center" }, { label: "SKU", width: "20mm" },
          { label: "Descricao" }, { label: "Un", width: "10mm", align: "center" },
          { label: "Qtd", width: "16mm", align: "right" },
          { label: "Reservado", width: "20mm", align: "right" },
          { label: "V. unit.", width: "22mm", align: "right" },
          { label: "Total", width: "24mm", align: "right" },
        ]}>
          {items.map((it: any) => (
            <tr key={it.id}>
              <Td align="center">{it.line_no}</Td>
              <Td bold>{it.sku}</Td>
              <Td>{it.description}</Td>
              <Td align="center">{it.unit}</Td>
              <Td align="right">{fmtNumber(it.quantity)}</Td>
              <Td align="right">{fmtNumber(it.reserved_qty)}</Td>
              <Td align="right">{fmtMoney(it.unit_price)}</Td>
              <Td align="right">{fmtMoney(it.quantity * it.unit_price)}</Td>
            </tr>
          ))}
        </DocTable>
        <DocTotals rows={[
          { label: "Linhas", value: items.length },
          { label: "Quantidade", value: fmtNumber(items.reduce((s, i) => s + i.quantity, 0)) },
          { label: "Peso estimado", value: fmtWeight(order.total_weight_kg, 2) },
          { label: "Volumes", value: fmtNumber(order.total_volumes) },
          { label: "Valor total", value: fmtMoney(order.total_value), strong: true },
        ]} />
      </DocSection>

      <DocSection title="Situacao operacional">
        <DocFields cols={4} fields={[
          { label: "Status", value: order.status },
          { label: "Liberado em", value: fmtDateTime(order.released_at) },
          { label: "Expedido em", value: fmtDateTime(order.shipped_at) },
          { label: "Reserva completa", value: order.reserved ? "Sim" : "Nao" },
        ]} />
      </DocSection>

      {order.notes && <DocSection title="Observacoes"><p className="text-[8.5pt]">{order.notes}</p></DocSection>}

      <DocSignatures labels={["Planejamento", "Expedicao"]} />
      <DocFooter docId={order.id} />
    </Sheet>
  );
}

// ================================================================== picklist
export function PicklistDoc({ picking, items }: { picking: any; items: any[] }) {
  return (
    <Sheet>
      <DocHeader
        title="Lista de separacao" number={picking.id} issuedAt={picking.created_at} code={picking.id}
        subtitle={`Pedido ${picking.sales_order_id} · estrategia ${picking.strategy}`}
        extra={
          <DocFields cols={4} fields={[
            { label: "Cliente", value: picking.customer_name },
            { label: "Prioridade", value: picking.priority },
            { label: "Prazo", value: fmtDateTime(picking.due_at) },
            { label: "Operador", value: picking.operator_name ?? "________" },
          ]} />
        }
      />

      <DocSection title="Sequencia de coleta">
        <p className="text-[7.5pt] mb-2 text-[#555]">
          A sequencia segue a rota fisica do armazem. Em cada linha: bipar o endereco, bipar o produto
          e confirmar a quantidade na coletora.
        </p>
        <DocTable head={[
          { label: "Seq", width: "10mm", align: "center" },
          { label: "Endereco", width: "26mm" }, { label: "Zona", width: "30mm" },
          { label: "SKU", width: "20mm" }, { label: "Descricao" },
          { label: "Lote", width: "18mm" }, { label: "Validade", width: "20mm" },
          { label: "Qtd", width: "16mm", align: "right" },
          { label: "Coletado", width: "20mm", align: "right" },
        ]}>
          {items.map((it: any) => (
            <tr key={it.id}>
              <Td align="center" bold>{it.sequence}</Td>
              <Td bold>{it.location_code}</Td>
              <Td>{it.zone_name}</Td>
              <Td bold>{it.sku}</Td>
              <Td>{it.description}</Td>
              <Td>{it.lot_code ?? "—"}</Td>
              <Td>{it.expires_at ? fmtDate(it.expires_at) : "—"}</Td>
              <Td align="right">{fmtNumber(it.expected_qty)} {it.unit}</Td>
              <Td align="right">{it.status === "PENDING" ? "________" : fmtNumber(it.picked_qty)}</Td>
            </tr>
          ))}
        </DocTable>
        <DocTotals rows={[
          { label: "Linhas", value: picking.total_lines },
          { label: "Unidades", value: fmtNumber(picking.total_units), strong: true },
        ]} />
      </DocSection>

      <DocSection title="Codigos de leitura">
        <div className="flex flex-wrap gap-3 mt-1">
          {items.slice(0, 8).map((it: any) => (
            <div key={it.id} className="border border-[#999] p-1.5 text-center">
              <p className="text-[6.8pt] uppercase tracking-[0.1em] text-[#555] mb-1">Seq {it.sequence}</p>
              <Barcode value={it.location_id} height={32} moduleWidth={1.3} fontSize={7} quietZone={6} />
            </div>
          ))}
        </div>
      </DocSection>

      <DocSignatures labels={["Separador", "Conferente"]} />
      <DocFooter docId={picking.id} />
    </Sheet>
  );
}

// ============================================================== packing list
export function PackingListDoc({ order, volumes }: { order: any; volumes: any[] }) {
  const totalQty = volumes.reduce((s, v) => s + v.items.reduce((a: number, i: any) => a + i.quantity, 0), 0);
  return (
    <Sheet>
      <DocHeader
        title="Packing list" number={order.id} issuedAt={order.issued_at} code={order.id}
        subtitle={`${volumes.length} volume(s)`}
        extra={
          <DocFields cols={3} fields={[
            { label: "Cliente", value: <><b>{order.customer_name}</b><br />CNPJ {fmtCnpj(order.customer_cnpj)}</> },
            { label: "Endereco de entrega", value: `${order.address ?? ""} — ${order.city}/${order.state}` },
            { label: "Transportadora", value: order.carrier ?? "—" },
          ]} />
        }
      />

      {volumes.map((v: any) => (
        <DocSection key={v.id} title={`Volume ${v.sequence} — ${v.id}`}>
          <div className="flex items-start justify-between gap-4 mb-2">
            <DocFields cols={4} fields={[
              { label: "Embalagem", value: v.container_kind },
              { label: "Dimensoes", value: fmtDimensions(v.length_cm, v.width_cm, v.height_cm) },
              { label: "Peso liquido", value: fmtWeight(v.net_weight_kg, 3) },
              { label: "Peso bruto", value: fmtWeight(v.gross_weight_kg, 3) },
            ]} />
            <div className="flex-none">
              <Barcode value={v.id} height={34} moduleWidth={1.4} fontSize={7} quietZone={6} />
            </div>
          </div>
          <DocTable compact head={[
            { label: "SKU", width: "22mm" }, { label: "Descricao" },
            { label: "Lote", width: "20mm" }, { label: "Validade", width: "22mm" },
            { label: "Qtd", width: "18mm", align: "right" },
          ]}>
            {v.items.map((i: any) => (
              <tr key={i.id}>
                <Td bold>{i.sku}</Td>
                <Td>{i.description}</Td>
                <Td>{i.lot_code ?? "—"}</Td>
                <Td>{i.expires_at ? fmtDate(i.expires_at) : "—"}</Td>
                <Td align="right">{fmtNumber(i.quantity)} {i.unit}</Td>
              </tr>
            ))}
          </DocTable>
        </DocSection>
      ))}

      <DocTotals rows={[
        { label: "Volumes", value: volumes.length },
        { label: "Quantidade total", value: fmtNumber(totalQty) },
        { label: "Peso bruto total", value: fmtWeight(volumes.reduce((s, v) => s + v.gross_weight_kg, 0), 3), strong: true },
      ]} />

      <DocSignatures labels={["Embalador", "Conferente de expedicao"]} />
      <DocFooter docId={`${order.id}-PACKING`} />
    </Sheet>
  );
}

// ================================================ conferencia de expedicao
export function ShippingCheckDoc({
  check, items, volumes,
}: { check: any; items: any[]; volumes: any[] }) {
  const divergences = items.filter((i: any) => i.divergence !== 0);
  return (
    <Sheet>
      <DocHeader
        title="Conferencia de expedicao" number={check.id} issuedAt={check.started_at} code={check.id}
        subtitle={`Pedido ${check.sales_order_id} · ${check.customer_name}`}
        extra={
          <DocFields cols={4} fields={[
            { label: "Conferente", value: check.operator_name ?? "________" },
            { label: "Inicio", value: fmtDateTime(check.started_at) },
            { label: "Termino", value: fmtDateTime(check.finished_at) },
            { label: "Resultado", value: <b>{check.status}</b> },
          ]} />
        }
      />

      <DocSection title="Pedido x separacao x embalagem x conferencia">
        <DocTable head={[
          { label: "SKU", width: "22mm" }, { label: "Descricao" },
          { label: "Pedido", width: "18mm", align: "right" },
          { label: "Separado", width: "18mm", align: "right" },
          { label: "Embalado", width: "18mm", align: "right" },
          { label: "Conferido", width: "18mm", align: "right" },
          { label: "Diverg.", width: "18mm", align: "right" },
        ]}>
          {items.map((i: any) => (
            <tr key={i.id}>
              <Td bold>{i.sku}</Td>
              <Td>{i.description}</Td>
              <Td align="right">{fmtNumber(i.ordered_qty)}</Td>
              <Td align="right">{fmtNumber(i.picked_qty)}</Td>
              <Td align="right">{fmtNumber(i.packed_qty)}</Td>
              <Td align="right">{fmtNumber(i.checked_qty)}</Td>
              <Td align="right" bold={i.divergence !== 0}>
                {i.divergence === 0 ? "0" : `${i.divergence > 0 ? "+" : ""}${fmtNumber(i.divergence)}`}
              </Td>
            </tr>
          ))}
        </DocTable>
      </DocSection>

      <DocSection title="Volumes conferidos">
        <DocTable compact head={[
          { label: "Volume", width: "28mm" }, { label: "Status", width: "26mm" },
          { label: "Peso bruto", width: "26mm", align: "right" }, { label: "Conferido em" },
        ]}>
          {volumes.map((v: any) => (
            <tr key={v.id}>
              <Td bold>{v.id}</Td>
              <Td>{v.status}</Td>
              <Td align="right">{fmtWeight(v.gross_weight_kg, 3)}</Td>
              <Td>{v.checked_at ? fmtDateTime(v.checked_at) : "________"}</Td>
            </tr>
          ))}
        </DocTable>
      </DocSection>

      <DocSection title="Parecer">
        <p className="text-[9pt]">
          {divergences.length === 0
            ? "Conferencia sem divergencias. Carga liberada para carregamento."
            : `Foram identificadas ${divergences.length} divergencia(s). A carga NAO deve ser embarcada ate o tratamento formal das ocorrencias.`}
        </p>
      </DocSection>

      <DocSignatures labels={["Conferente", "Supervisao de expedicao"]} />
      <DocFooter docId={check.id} />
    </Sheet>
  );
}

// ================================================================= romaneio
export function ManifestDoc({
  manifest, orders,
}: { manifest: any; orders: any[] }) {
  return (
    <Sheet>
      <DocHeader
        title="Romaneio de carga" number={manifest.id} issuedAt={manifest.created_at} code={manifest.id}
        subtitle={`Rota ${manifest.route}`}
        extra={
          <DocFields cols={3} fields={[
            { label: "Transportador", value: manifest.carrier ?? "—" },
            { label: "Veiculo", value: `${manifest.vehicle_kind ?? ""} ${manifest.vehicle_plate ?? "—"}` },
            { label: "Motorista", value: manifest.driver_name ?? "—" },
            { label: "Doc. motorista", value: manifest.driver_doc ?? "—" },
            { label: "Doca", value: manifest.dock_name ?? "—" },
            { label: "Lacre", value: <b>{manifest.seal ?? "________"}</b> },
            { label: "Saida", value: fmtDateTime(manifest.departed_at) },
            { label: "Status", value: manifest.status },
          ]} />
        }
      />

      <DocSection title="Sequencia de entrega">
        {/* Origem e retorno sao a propria sede: aparecem como moldura do
            roteiro, fora da tabela de paradas, porque nao sao entregas. */}
        <p className="text-[8.5pt] mb-2">
          <b>Origem:</b> {WAREHOUSE.tradeName} — {WAREHOUSE.address}, {WAREHOUSE.city}/{WAREHOUSE.state}
        </p>
        <DocTable head={[
          { label: "Parada", width: "14mm", align: "center" },
          { label: "Pedido", width: "26mm" }, { label: "Cliente" },
          { label: "CNPJ", width: "34mm" }, { label: "Destino", width: "40mm" },
          { label: "Volumes", width: "18mm", align: "right" },
          { label: "Peso (kg)", width: "20mm", align: "right" },
        ]}>
          {orders.map((o: any) => (
            <tr key={o.id}>
              <Td align="center" bold>{o.stop_sequence}</Td>
              <Td bold>{o.sales_order_id}</Td>
              <Td>{o.customer_name}</Td>
              <Td>{fmtCnpj(o.customer_cnpj)}</Td>
              <Td>{o.city}/{o.state}</Td>
              <Td align="right">{o.volumes}</Td>
              <Td align="right">{fmtNumber(o.weight_kg, 2)}</Td>
            </tr>
          ))}
        </DocTable>
        <p className="text-[8.5pt] mt-2">
          <b>Retorno:</b> {WAREHOUSE.tradeName} — o retorno a sede encerra a rota e nao constitui entrega.
        </p>
        <DocTotals rows={[
          { label: "Pedidos", value: manifest.total_orders },
          { label: "Volumes", value: manifest.total_volumes },
          { label: "Peso total", value: fmtWeight(manifest.total_weight_kg, 2) },
          { label: "Valor da carga", value: fmtMoney(manifest.total_value), strong: true },
        ]} />
      </DocSection>

      <DocSection title="Relacao de volumes">
        <div className="grid grid-cols-6 gap-1.5 text-[7.5pt]">
          {orders.flatMap((o: any) => o.volumeList.map((v: any) => (
            <span key={v.id} className="border border-[#999] px-1.5 py-1 text-center">
              {v.id}
            </span>
          )))}
        </div>
      </DocSection>

      <DocSignatures labels={["Conferente de carga", "Motorista", "Portaria"]} />
      <DocFooter docId={manifest.id} />
    </Sheet>
  );
}

// ================================================= documento de transporte
export function TransportDoc({
  doc, manifest, orders,
}: { doc: any; manifest: any; orders: any[] }) {
  return (
    <Sheet>
      <DocHeader
        simulated
        title="Documento de transporte" number={`${doc.number} — serie ${doc.series}`}
        issuedAt={doc.issued_at} code={doc.id}
        subtitle={`Romaneio ${doc.manifest_id}`}
      />

      <DocSection title="Chave de acesso (simulada)">
        <p className="text-[10pt] tracking-[0.1em] text-center border border-black py-1.5" style={{ fontFamily: "var(--font-mono)" }}>
          {fmtAccessKey(doc.access_key)}
        </p>
        <p className="text-[7pt] text-center mt-1 text-[#555]">
          Documento de simulacao academica. Nao substitui CT-e, MDF-e ou qualquer documento fiscal de transporte.
        </p>
      </DocSection>

      <DocSection title="Remetente">
        <DocFields cols={3} fields={[
          { label: "Razao social", value: <b>{WAREHOUSE.name}</b>, span: 2 },
          { label: "CNPJ", value: fmtCnpj(WAREHOUSE.cnpj) },
          { label: "Unidade", value: `${doc.sender_id} — ${WAREHOUSE.tradeName}`, span: 2 },
          { label: "Endereco", value: WAREHOUSE.address, span: 2 },
          { label: "Municipio / UF", value: `${WAREHOUSE.city}/${WAREHOUSE.state}` },
        ]} />
      </DocSection>

      <DocSection title="Transportador">
        <DocFields cols={4} fields={[
          { label: "Razao social", value: <b>{doc.carrier_name}</b>, span: 2 },
          { label: "CNPJ", value: fmtCnpj(doc.carrier_cnpj) },
          { label: "Veiculo", value: doc.vehicle_plate ?? "—" },
          { label: "Motorista", value: doc.driver_name ?? "—" },
          { label: "Documento", value: doc.driver_doc ?? "—" },
          { label: "Origem", value: doc.origin_city ?? "—" },
          { label: "Destino", value: doc.destination_city ?? "—" },
        ]} />
      </DocSection>

      <DocSection title="Destinatarios da carga">
        <DocTable head={[
          { label: "Parada", width: "14mm", align: "center" }, { label: "Pedido", width: "26mm" },
          { label: "Destinatario" }, { label: "CNPJ", width: "34mm" },
          { label: "Municipio / UF", width: "40mm" },
          { label: "Volumes", width: "18mm", align: "right" },
        ]}>
          {orders.map((o: any) => (
            <tr key={o.id}>
              <Td align="center">{o.stop_sequence}</Td>
              <Td bold>{o.sales_order_id}</Td>
              <Td>{o.customer_name}</Td>
              <Td>{fmtCnpj(o.customer_cnpj)}</Td>
              <Td>{o.city}/{o.state}</Td>
              <Td align="right">{o.volumes}</Td>
            </tr>
          ))}
        </DocTable>
      </DocSection>

      <DocSection title="Dados da carga">
        <DocFields cols={4} fields={[
          { label: "Volumes", value: fmtNumber(doc.total_volumes) },
          { label: "Peso bruto", value: fmtWeight(doc.total_weight_kg, 3) },
          { label: "Valor da carga", value: fmtMoney(doc.total_value) },
          { label: "Valor do frete", value: fmtMoney(doc.freight_value) },
          { label: "Lacre", value: manifest?.seal ?? "—" },
          { label: "Rota", value: manifest?.route ?? "—", span: 2 },
          { label: "Saida", value: fmtDateTime(manifest?.departed_at) },
        ]} />
      </DocSection>

      <DocSignatures labels={["Remetente", "Transportador", "Recebedor"]} />
      <DocFooter docId={doc.id} simulated />
    </Sheet>
  );
}

// =============================================== checklist de carregamento
export function LoadingChecklistDoc({
  loading, expected,
}: { loading: any; expected: any[] }) {
  const loaded = expected.filter((v: any) => v.scanned_at);
  return (
    <Sheet>
      <DocHeader
        title="Checklist de carregamento" number={loading.id} issuedAt={loading.created_at} code={loading.id}
        subtitle={`Romaneio ${loading.manifest_id} · rota ${loading.route}`}
        extra={
          <DocFields cols={4} fields={[
            { label: "Doca", value: loading.dock_name ?? "—" },
            { label: "Veiculo", value: loading.vehicle_plate ?? "—" },
            { label: "Motorista", value: loading.driver_name ?? "—" },
            { label: "Operador", value: loading.operator_name ?? "________" },
            { label: "Inicio", value: fmtDateTime(loading.started_at) },
            { label: "Termino", value: fmtDateTime(loading.completed_at) },
            { label: "Lacre", value: <b>{loading.seal ?? "________"}</b> },
            { label: "Status", value: loading.status },
          ]} />
        }
      />

      <DocSection title="Volumes a carregar">
        <DocTable head={[
          { label: "Parada", width: "14mm", align: "center" },
          { label: "Volume", width: "28mm" }, { label: "Pedido", width: "26mm" },
          { label: "Cliente" }, { label: "Peso (kg)", width: "20mm", align: "right" },
          { label: "Carregado", width: "22mm" }, { label: "OK", width: "12mm", align: "center" },
        ]}>
          {expected.map((v: any) => (
            <tr key={v.id}>
              <Td align="center">{v.stop_sequence}</Td>
              <Td bold>{v.id}</Td>
              <Td>{v.sales_order_id}</Td>
              <Td>{v.customer_name}</Td>
              <Td align="right">{fmtNumber(v.gross_weight_kg, 2)}</Td>
              <Td>{v.scanned_at ? fmtDateTime(v.scanned_at) : "________"}</Td>
              <Td align="center">{v.scanned_at ? "X" : "☐"}</Td>
            </tr>
          ))}
        </DocTable>
        <DocTotals rows={[
          { label: "Previstos", value: loading.expected_volumes },
          { label: "Carregados", value: loading.loaded_volumes },
          { label: "Faltantes", value: Math.max(0, loading.expected_volumes - loading.loaded_volumes), strong: true },
          { label: "Peso carregado", value: fmtWeight(loaded.reduce((s: number, v: any) => s + v.gross_weight_kg, 0), 2) },
        ]} />
      </DocSection>

      <DocSection title="Conferencia final">
        <ul className="text-[8.5pt] leading-relaxed">
          <li>☐ Todos os volumes do romaneio foram bipados e conferidos</li>
          <li>☐ Carga estivada e amarrada conforme procedimento</li>
          <li>☐ Documentos entregues ao motorista (romaneio e documento de transporte)</li>
          <li>☐ Lacre aplicado e numero registrado no sistema</li>
          <li>☐ Doca liberada</li>
        </ul>
      </DocSection>

      <DocSignatures labels={["Operador de carregamento", "Conferente", "Motorista"]} />
      <DocFooter docId={loading.id} />
    </Sheet>
  );
}

// =============================================== comprovante de expedicao
export function ShippingReceiptDoc({
  order, volumes, manifest, shipment,
}: { order: any; volumes: any[]; manifest: any; shipment: any }) {
  return (
    <Sheet>
      <DocHeader
        title="Comprovante de expedicao" number={shipment?.id ?? order.id}
        issuedAt={shipment?.shipped_at ?? order.shipped_at} code={shipment?.id ?? order.id}
        subtitle={`Pedido ${order.id}`}
        extra={
          <DocFields cols={3} fields={[
            { label: "Cliente", value: <><b>{order.customer_name}</b><br />CNPJ {fmtCnpj(order.customer_cnpj)}</> },
            { label: "Entrega", value: `${order.ship_to_city}/${order.ship_to_state}` },
            { label: "Romaneio", value: manifest?.id ?? "—" },
          ]} />
        }
      />

      <DocSection title="Dados do embarque">
        <DocFields cols={4} fields={[
          { label: "Data de expedicao", value: fmtDateTime(shipment?.shipped_at ?? order.shipped_at) },
          { label: "Veiculo", value: manifest?.vehicle_plate ?? "—" },
          { label: "Motorista", value: manifest?.driver_name ?? "—" },
          { label: "Lacre", value: manifest?.seal ?? "—" },
          { label: "Transportadora", value: manifest?.carrier ?? order.carrier ?? "—" },
          { label: "Rota", value: manifest?.route ?? "—", span: 2 },
          { label: "Prazo do pedido", value: fmtDateTime(order.due_at) },
        ]} />
      </DocSection>

      <DocSection title="Volumes expedidos">
        <DocTable head={[
          { label: "Volume", width: "28mm" }, { label: "Embalagem", width: "24mm" },
          { label: "Dimensoes", width: "40mm" },
          { label: "Peso liquido", width: "26mm", align: "right" },
          { label: "Peso bruto", width: "26mm", align: "right" },
        ]}>
          {volumes.map((v: any) => (
            <tr key={v.id}>
              <Td bold>{v.id}</Td>
              <Td>{v.container_kind}</Td>
              <Td>{fmtDimensions(v.length_cm, v.width_cm, v.height_cm)}</Td>
              <Td align="right">{fmtNumber(v.net_weight_kg, 3)}</Td>
              <Td align="right">{fmtNumber(v.gross_weight_kg, 3)}</Td>
            </tr>
          ))}
        </DocTable>
        <DocTotals rows={[
          { label: "Volumes", value: volumes.length },
          { label: "Peso bruto", value: fmtWeight(volumes.reduce((s, v) => s + v.gross_weight_kg, 0), 3), strong: true },
        ]} />
      </DocSection>

      <DocSection title="Declaracao">
        <p className="text-[8.5pt] leading-relaxed">
          Declaramos que a mercadoria descrita neste comprovante foi separada, conferida, embalada e
          entregue ao transportador nas condicoes registradas, com baixa definitiva no estoque do
          armazem {WAREHOUSE.id} no momento da expedicao.
        </p>
      </DocSection>

      <DocSignatures labels={["Expedicao", "Transportador", "Recebedor"]} />
      <DocFooter docId={shipment?.id ?? order.id} />
    </Sheet>
  );
}

// ================================================ documento de movimentacao
export function MovementDoc({ movements, title, refId }: { movements: any[]; title: string; refId: string }) {
  return (
    <Sheet>
      <DocHeader
        title="Documento de movimentacao" number={refId} code={refId}
        subtitle={title} issuedAt={movements[0]?.occurred_at}
      />
      <DocSection title="Movimentos registrados">
        <DocTable head={[
          { label: "Movimento", width: "26mm" }, { label: "Tipo", width: "34mm" },
          { label: "SKU", width: "20mm" }, { label: "Lote", width: "18mm" },
          { label: "Qtd", width: "16mm", align: "right" },
          { label: "Origem", width: "26mm" }, { label: "Destino", width: "26mm" },
          { label: "Operador", width: "24mm" }, { label: "Data e hora" },
        ]}>
          {movements.map((m: any) => (
            <tr key={m.id}>
              <Td bold>{m.id}</Td>
              <Td>{m.kind}</Td>
              <Td>{m.sku}</Td>
              <Td>{m.lot_code ?? "—"}</Td>
              <Td align="right">{fmtNumber(m.quantity)}</Td>
              <Td>{m.from_code ?? "—"}</Td>
              <Td>{m.to_code ?? "—"}</Td>
              <Td>{m.operator_name ?? m.operator_id ?? "sistema"}</Td>
              <Td>{fmtDateTime(m.occurred_at)}</Td>
            </tr>
          ))}
        </DocTable>
      </DocSection>
      <DocSignatures labels={["Operador", "Supervisao"]} />
      <DocFooter docId={refId} />
    </Sheet>
  );
}
