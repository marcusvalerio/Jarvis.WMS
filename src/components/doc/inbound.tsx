import {
  Sheet, DocHeader, DocSection, DocFields, DocTable, Td, DocTotals,
  DocSignatures, DocFooter, fmtCnpj, fmtAccessKey,
} from "./Sheet";
import { fmtNumber, fmtMoney, fmtWeight, fmtDate, fmtDateTime } from "@/lib/format";
import { WAREHOUSE } from "@/seed/scenario";

// ============================================================ pedido de compra
export function PurchaseOrderDoc({ po, items }: { po: any; items: any[] }) {
  return (
    <Sheet>
      <DocHeader
        title="Pedido de compra" number={po.id} issuedAt={po.issued_at} code={po.id}
        subtitle={`Entrega prevista ${fmtDate(po.expected_at)}`}
        extra={
          <DocFields cols={2} fields={[
            { label: "Fornecedor", value: <><b>{po.supplier_name}</b><br />CNPJ {fmtCnpj(po.supplier_cnpj)}</> },
            { label: "Endereco", value: `${po.supplier_address ?? ""} — ${po.supplier_city}/${po.supplier_state}` },
            { label: "Comprador", value: po.buyer },
            { label: "Condicao de pagamento", value: po.payment_terms },
          ]} />
        }
      />

      <DocSection title="Itens do pedido">
        <DocTable head={[
          { label: "Item", width: "8mm", align: "center" }, { label: "SKU", width: "20mm" },
          { label: "Descricao" }, { label: "NCM", width: "16mm" },
          { label: "Lote", width: "18mm" }, { label: "Validade", width: "20mm" },
          { label: "Un", width: "10mm", align: "center" }, { label: "Qtd", width: "16mm", align: "right" },
          { label: "V. unit.", width: "22mm", align: "right" }, { label: "Total", width: "24mm", align: "right" },
        ]}>
          {items.map((it: any) => (
            <tr key={it.id}>
              <Td align="center">{it.line_no}</Td>
              <Td bold>{it.sku}</Td>
              <Td>{it.description}</Td>
              <Td>{it.ncm ?? "—"}</Td>
              <Td>{it.lot_code ?? "—"}</Td>
              <Td>{it.expires_at ? fmtDate(it.expires_at) : "—"}</Td>
              <Td align="center">{it.unit}</Td>
              <Td align="right">{fmtNumber(it.quantity)}</Td>
              <Td align="right">{fmtMoney(it.unit_price)}</Td>
              <Td align="right">{fmtMoney(it.quantity * it.unit_price)}</Td>
            </tr>
          ))}
        </DocTable>
        <DocTotals rows={[
          { label: "Itens", value: items.length },
          { label: "Quantidade", value: fmtNumber(items.reduce((s, i) => s + i.quantity, 0)) },
          { label: "Peso total", value: fmtWeight(po.total_weight_kg, 2) },
          { label: "Valor total", value: fmtMoney(po.total_value), strong: true },
        ]} />
      </DocSection>

      {po.notes && <DocSection title="Observacoes"><p className="text-[8.5pt]">{po.notes}</p></DocSection>}

      <DocSignatures labels={["Comprador", "Fornecedor"]} />
      <DocFooter docId={po.id} />
    </Sheet>
  );
}

// ==================================================== ordem de recebimento
export function InboundOrderDoc({ order, items, invoice }: { order: any; items: any[]; invoice: any }) {
  return (
    <Sheet>
      <DocHeader
        title="Ordem de recebimento" number={order.id} issuedAt={order.created_at} code={order.id}
        subtitle={`Agendado para ${fmtDateTime(order.scheduled_at)}`}
        extra={
          <DocFields cols={3} fields={[
            { label: "Fornecedor", value: <><b>{order.supplier_name}</b><br />CNPJ {fmtCnpj(order.supplier_cnpj)}</> },
            { label: "Pedido de compra", value: order.purchase_order_id ?? "—" },
            { label: "Nota fiscal", value: invoice ? `${invoice.number}/${invoice.series}` : "—" },
            { label: "Veiculo", value: `${order.vehicle_kind ?? ""} ${order.vehicle_plate ?? "—"}` },
            { label: "Motorista", value: `${order.driver_name ?? "—"} (${order.driver_doc ?? "—"})` },
            { label: "Transportadora", value: order.carrier ?? "—" },
            { label: "Doca", value: order.dock_name ?? "—" },
            { label: "Volumes previstos", value: fmtNumber(order.expected_volumes) },
            { label: "Peso previsto", value: fmtWeight(order.expected_weight_kg, 2) },
          ]} />
        }
      />

      <DocSection title="Itens a receber">
        <DocTable head={[
          { label: "Item", width: "8mm", align: "center" }, { label: "SKU", width: "20mm" },
          { label: "Descricao" }, { label: "Lote", width: "18mm" }, { label: "Validade", width: "20mm" },
          { label: "Un", width: "10mm", align: "center" }, { label: "Previsto", width: "18mm", align: "right" },
          { label: "Conferido", width: "20mm", align: "right" }, { label: "Divergencia", width: "22mm", align: "right" },
        ]}>
          {items.map((it: any) => {
            const d = it.checked_qty - it.expected_qty;
            return (
              <tr key={it.id}>
                <Td align="center">{it.line_no}</Td>
                <Td bold>{it.sku}</Td>
                <Td>{it.description}</Td>
                <Td>{it.lot_code ?? "—"}</Td>
                <Td>{it.expires_at ? fmtDate(it.expires_at) : "—"}</Td>
                <Td align="center">{it.unit}</Td>
                <Td align="right">{fmtNumber(it.expected_qty)}</Td>
                <Td align="right">{it.status === "PENDING" ? "" : fmtNumber(it.checked_qty)}</Td>
                <Td align="right" bold={d !== 0}>
                  {it.status === "PENDING" ? "" : d === 0 ? "0" : `${d > 0 ? "+" : ""}${fmtNumber(d)}`}
                </Td>
              </tr>
            );
          })}
        </DocTable>
        <DocTotals rows={[
          { label: "Linhas", value: items.length },
          { label: "Qtd prevista", value: fmtNumber(items.reduce((s, i) => s + i.expected_qty, 0)), strong: true },
        ]} />
      </DocSection>

      <DocSection title="Registro da operacao">
        <DocFields cols={4} fields={[
          { label: "Chegada", value: fmtDateTime(order.arrived_at) },
          { label: "Inicio da descarga", value: fmtDateTime(order.started_at) },
          { label: "Conferencia", value: fmtDateTime(order.checked_at) },
          { label: "Conclusao", value: fmtDateTime(order.completed_at) },
          { label: "Status", value: order.status },
          { label: "Operador", value: order.operator_name ?? "—" },
        ]} />
      </DocSection>

      <DocSignatures labels={["Conferente", "Motorista", "Supervisao"]} />
      <DocFooter docId={order.id} />
    </Sheet>
  );
}

// ============================================================ nota fiscal
export function InvoiceDoc({
  invoice, items, issuer, recipient,
}: { invoice: any; items: any[]; issuer: any; recipient: any }) {
  return (
    <Sheet>
      <DocHeader
        simulated
        title={invoice.kind === "INBOUND" ? "Nota fiscal de entrada" : "Nota fiscal de saida"}
        number={`${invoice.number} — serie ${invoice.series}`}
        issuedAt={invoice.issued_at}
        code={invoice.id}
        subtitle={invoice.nature_op}
      />

      <DocSection title="Chave de acesso (simulada)">
        <p className="text-[10pt] tracking-[0.1em] text-center border border-black py-1.5" style={{ fontFamily: "var(--font-mono)" }}>
          {fmtAccessKey(invoice.access_key)}
        </p>
        <p className="text-[7pt] text-center mt-1 text-[#555]">
          Chave gerada localmente para fins academicos. Nao ha emissao, transmissao ou autorizacao junto a SEFAZ.
        </p>
      </DocSection>

      <DocSection title="Emitente">
        <DocFields cols={3} fields={[
          { label: "Razao social", value: <b>{issuer?.name}</b>, span: 2 },
          { label: "CNPJ", value: fmtCnpj(issuer?.cnpj) },
          { label: "Endereco", value: issuer?.address ?? WAREHOUSE.address, span: 2 },
          { label: "Municipio / UF", value: `${issuer?.city ?? WAREHOUSE.city}/${issuer?.state ?? WAREHOUSE.state}` },
        ]} />
      </DocSection>

      <DocSection title="Destinatario">
        <DocFields cols={3} fields={[
          { label: "Razao social", value: <b>{recipient?.name}</b>, span: 2 },
          { label: "CNPJ", value: fmtCnpj(recipient?.cnpj) },
          { label: "Endereco", value: recipient?.address ?? WAREHOUSE.address, span: 2 },
          { label: "Municipio / UF", value: `${recipient?.city ?? WAREHOUSE.city}/${recipient?.state ?? WAREHOUSE.state}` },
        ]} />
      </DocSection>

      <DocSection title="Produtos e servicos">
        <DocTable head={[
          { label: "Item", width: "8mm", align: "center" }, { label: "SKU", width: "20mm" },
          { label: "Descricao" }, { label: "NCM", width: "16mm" }, { label: "CFOP", width: "13mm" },
          { label: "Lote", width: "18mm" },
          { label: "Un", width: "9mm", align: "center" }, { label: "Qtd", width: "15mm", align: "right" },
          { label: "V. unit.", width: "21mm", align: "right" }, { label: "V. total", width: "23mm", align: "right" },
        ]}>
          {items.map((it: any) => (
            <tr key={it.id}>
              <Td align="center">{it.line_no}</Td>
              <Td bold>{it.sku}</Td>
              <Td>{it.description}</Td>
              <Td>{it.ncm ?? "—"}</Td>
              <Td>{it.cfop ?? "—"}</Td>
              <Td>{it.lot_code ?? "—"}</Td>
              <Td align="center">{it.unit}</Td>
              <Td align="right">{fmtNumber(it.quantity)}</Td>
              <Td align="right">{fmtMoney(it.unit_price)}</Td>
              <Td align="right">{fmtMoney(it.total_price)}</Td>
            </tr>
          ))}
        </DocTable>
        <DocTotals rows={[
          { label: "Qtd total", value: fmtNumber(items.reduce((s, i) => s + i.quantity, 0)) },
          { label: "Volumes", value: fmtNumber(invoice.total_volumes) },
          { label: "Peso bruto", value: fmtWeight(invoice.total_weight_kg, 3) },
          { label: "Valor dos produtos", value: fmtMoney(invoice.total_products) },
          { label: "Valor total da nota", value: fmtMoney(invoice.total_invoice), strong: true },
        ]} />
      </DocSection>

      <DocSection title="Informacoes complementares">
        <p className="text-[8pt] leading-snug">
          Documento gerado por simulacao academica de operacao logistica. Todos os dados cadastrais,
          numeracao e chave de acesso sao ficticios. Este documento nao possui validade fiscal,
          tributaria ou juridica e nao substitui qualquer documento fiscal eletronico.
          {invoice.inbound_order_id && ` Vinculado a ordem de recebimento ${invoice.inbound_order_id}.`}
          {invoice.sales_order_id && ` Vinculado ao pedido de venda ${invoice.sales_order_id}.`}
        </p>
      </DocSection>

      <DocFooter docId={invoice.id} simulated />
    </Sheet>
  );
}

// ======================================================= comprovante de pesagem
export function WeighingDoc({ weighing }: { weighing: any }) {
  return (
    <Sheet>
      <DocHeader
        title="Comprovante de pesagem" number={weighing.id} issuedAt={weighing.weighed_at} code={weighing.id}
        subtitle={`Referencia ${weighing.ref_kind} ${weighing.ref_id}`}
      />

      <DocSection title="Aferição">
        <div className="grid grid-cols-3 gap-4 my-4">
          {[
            { label: "Peso bruto", strong: false },
            { label: "Tara", strong: false },
            { label: "Peso liquido", strong: true },
          ].map((b) => (
            <div key={b.label} className={`border-2 ${b.strong ? "border-black" : "border-[#999]"} p-3 text-center`}>
              <p className="text-[7pt] tracking-[0.12em] uppercase text-[#555]">{b.label}</p>
              <p
                className={`${b.strong ? "text-[24pt]" : "text-[19pt]"} font-bold leading-none mt-1.5`}
                style={{ fontFamily: "var(--font-familjen)", fontVariantNumeric: "tabular-nums" }}
              >
                __________________
              </p>
              <p className="text-[8pt] mt-0.5">kg</p>
            </div>
          ))}
        </div>
        <p className="text-[8pt] text-center">
          Peso liquido = peso bruto − tara = __________ − __________ = __________ kg
        </p>
      </DocSection>

      <DocSection title="Conferencia com o previsto">
        <DocFields cols={3} fields={[
          { label: "Peso previsto", value: "________________ kg" },
          { label: "Peso aferido", value: "________________ kg" },
          { label: "Divergencia", value: "________________ kg" },
        ]} />
      </DocSection>

      <DocSection title="Registro">
        <DocFields cols={4} fields={[
          { label: "Data e hora", value: fmtDateTime(weighing.weighed_at) },
          { label: "Operador", value: weighing.operator_name ?? weighing.operator_id ?? "—" },
          { label: "Equipamento", value: weighing.equipment_model ?? weighing.equipment_id ?? "—" },
          { label: "Documento", value: weighing.ref_id },
        ]} />
        {weighing.notes && <p className="text-[8.5pt] mt-2">{weighing.notes}</p>}
      </DocSection>

      <DocSignatures labels={["Operador da balanca", "Conferente"]} />
      <DocFooter docId={weighing.id} note="pesagem simulada — sem balanca fisica integrada" />
    </Sheet>
  );
}

// ================================================ checklist de recebimento
export function ReceivingChecklistDoc({
  order, items, check, checkItems, weighings, pallets,
}: { order: any; items: any[]; check: any; checkItems: any[]; weighings: any[]; pallets: any[] }) {
  const divergences = checkItems.filter((c: any) => c.divergence !== 0);
  return (
    <Sheet>
      <DocHeader
        title="Checklist de recebimento" number={order.id} issuedAt={order.created_at} code={order.id}
        subtitle={`Fornecedor ${order.supplier_name}`}
        extra={
          <DocFields cols={4} fields={[
            { label: "Veiculo", value: order.vehicle_plate ?? "—" },
            { label: "Motorista", value: order.driver_name ?? "—" },
            { label: "Doca", value: order.dock_name ?? "—" },
            { label: "Conferente", value: check?.operator_id ?? order.operator_name ?? "—" },
          ]} />
        }
      />

      <DocSection title="1. Conferencia quantitativa">
        <DocTable head={[
          { label: "SKU", width: "20mm" }, { label: "Descricao" },
          { label: "Lote", width: "18mm" }, { label: "Validade", width: "20mm" },
          { label: "Esperado", width: "18mm", align: "right" },
          { label: "Conferido", width: "18mm", align: "right" },
          { label: "Diverg.", width: "18mm", align: "right" },
          { label: "OK", width: "12mm", align: "center" },
        ]}>
          {(checkItems.length ? checkItems : items).map((it: any) => {
            const expected = it.expected_qty;
            const checked = it.checked_qty ?? 0;
            const d = checked - expected;
            return (
              <tr key={it.id}>
                <Td bold>{it.sku}</Td>
                <Td>{it.description}</Td>
                <Td>{it.lot_code ?? "—"}</Td>
                <Td>{it.expires_at ? fmtDate(it.expires_at) : "—"}</Td>
                <Td align="right">{fmtNumber(expected)}</Td>
                <Td align="right">{it.status === "PENDING" ? "________" : fmtNumber(checked)}</Td>
                <Td align="right" bold={d !== 0}>{it.status === "PENDING" ? "" : d === 0 ? "0" : `${d > 0 ? "+" : ""}${fmtNumber(d)}`}</Td>
                <Td align="center">{it.status === "OK" ? "X" : it.status === "DIVERGENCE" ? "!" : "☐"}</Td>
              </tr>
            );
          })}
        </DocTable>
      </DocSection>

      <DocSection title="2. Pesagem">
        <DocTable head={[
          { label: "Documento", width: "26mm" }, { label: "Bruto (kg)", align: "right" },
          { label: "Tara (kg)", align: "right" }, { label: "Liquido (kg)", align: "right" },
          { label: "Previsto (kg)", align: "right" }, { label: "Divergencia", align: "right" },
          { label: "Data" },
        ]}>
          {weighings.length ? weighings.map((w: any) => (
            <tr key={w.id}>
              <Td bold>{w.id}</Td>
              <Td align="right">________</Td>
              <Td align="right">________</Td>
              <Td align="right" bold>________</Td>
              <Td align="right">________</Td>
              <Td align="right">________</Td>
              <Td>{fmtDateTime(w.weighed_at)}</Td>
            </tr>
          )) : (
            <tr>
              <Td bold>________</Td>
              <Td align="right">________</Td>
              <Td align="right">________</Td>
              <Td align="right" bold>________</Td>
              <Td align="right">________</Td>
              <Td align="right">________</Td>
              <Td>________</Td>
            </tr>
          )}
        </DocTable>
      </DocSection>

      <DocSection title="3. Paletizacao">
        {pallets.length === 0 ? (
          <p className="text-[8.5pt]">Nenhum palete montado.</p>
        ) : (
          <DocTable head={[
            { label: "Palete", width: "28mm" }, { label: "Itens", align: "center", width: "14mm" },
            { label: "Peso liquido", align: "right", width: "24mm" },
            { label: "Endereco", width: "26mm" }, { label: "Status" },
          ]}>
            {pallets.map((p: any) => (
              <tr key={p.id}>
                <Td bold>{p.id}</Td>
                <Td align="center">{p.line_count}</Td>
                <Td align="right">{fmtNumber(p.net_weight_kg, 2)} kg</Td>
                <Td>{p.location_code ?? "________"}</Td>
                <Td>{p.status}</Td>
              </tr>
            ))}
          </DocTable>
        )}
      </DocSection>

      <DocSection title="4. Ocorrencias">
        {divergences.length === 0 ? (
          <p className="text-[8.5pt]">Nenhuma divergencia registrada na conferencia.</p>
        ) : (
          <ul className="text-[8.5pt] list-disc pl-4">
            {divergences.map((d: any) => (
              <li key={d.id}>
                {d.sku}: esperado {fmtNumber(d.expected_qty)}, conferido {fmtNumber(d.checked_qty)} —
                divergencia de {d.divergence > 0 ? "+" : ""}{fmtNumber(d.divergence)}
              </li>
            ))}
          </ul>
        )}
      </DocSection>

      <DocSignatures labels={["Conferente", "Supervisao", "Motorista"]} />
      <DocFooter docId={`${order.id}-CHECKLIST`} />
    </Sheet>
  );
}

// ================================================ ordem de armazenagem
export function StorageOrderDoc({ order, pallet, items }: { order: any; pallet: any; items: any[] }) {
  return (
    <Sheet>
      <DocHeader
        title="Ordem de armazenagem" number={order.id} issuedAt={order.created_at} code={order.id}
        subtitle={`Palete ${order.pallet_id}`}
        extra={
          <DocFields cols={3} fields={[
            { label: "Origem", value: order.inbound_order_id ?? pallet?.origin_ref ?? "—" },
            { label: "Endereco sugerido", value: <b className="text-[12pt]">{order.suggested_code ?? "—"}</b> },
            { label: "Endereco confirmado", value: <b className="text-[12pt]">{order.final_code ?? "________"}</b> },
          ]} />
        }
      />

      <DocSection title="Conteudo do palete">
        <DocTable head={[
          { label: "SKU", width: "22mm" }, { label: "Descricao" },
          { label: "Lote", width: "20mm" }, { label: "Validade", width: "22mm" },
          { label: "Qtd", width: "18mm", align: "right" },
        ]}>
          {items.map((i: any) => (
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

      <DocSection title="Execucao">
        <DocFields cols={4} fields={[
          { label: "Status", value: order.status },
          { label: "Operador", value: order.operator_id ?? "________" },
          { label: "Inicio", value: fmtDateTime(order.started_at) },
          { label: "Conclusao", value: fmtDateTime(order.completed_at) },
          { label: "Justificativa de desvio", value: order.override_reason ?? "—", span: 4 },
        ]} />
      </DocSection>

      <DocSection title="Procedimento">
        <ol className="text-[8.5pt] list-decimal pl-4 leading-relaxed">
          <li>Bipar a etiqueta do palete <b>{order.pallet_id}</b> na coletora.</li>
          <li>Conduzir o palete ate o endereco <b>{order.suggested_code ?? "indicado"}</b>.</li>
          <li>Bipar a etiqueta do endereco para validacao.</li>
          <li>Confirmar a armazenagem; o WMS registra a movimentacao e atualiza o saldo.</li>
        </ol>
      </DocSection>

      <DocSignatures labels={["Operador", "Supervisao"]} />
      <DocFooter docId={order.id} />
    </Sheet>
  );
}
