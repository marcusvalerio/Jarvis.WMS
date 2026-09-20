import { Barcode } from "@/components/Barcode";
import { fmtDateTime, fmtDate, fmtCnpj, fmtAccessKey } from "@/lib/format";
import { WAREHOUSE, SCENARIO_ID } from "@/seed/scenario";
import type { ReactNode } from "react";

/**
 * Folha de documento operacional.
 * Fundo branco e tipografia de impressao — o mesmo componente serve a tela
 * e ao papel. Todo dado vem da entidade correspondente no banco.
 */
export function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <article
      className={`doc-sheet bg-white text-black mx-auto my-6 px-[14mm] py-[12mm] shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_18px_40px_rgba(0,0,0,0.45)] ${className}`}
      style={{ width: "210mm", minHeight: "297mm", fontFamily: "var(--font-sora)" }}
    >
      {children}
    </article>
  );
}

export function DocHeader({
  title, subtitle, code, number, issuedAt, simulated = false, extra,
}: {
  title: string;
  subtitle?: string;
  /** Valor codificado no Code 128 — igual ao ID da entidade. */
  code?: string;
  number?: string;
  issuedAt?: string;
  simulated?: boolean;
  extra?: ReactNode;
}) {
  return (
    <header className="avoid-break">
      {/* Documento fiscal simulado nunca pode ser confundido com o real —
          a tarja diz as quatro coisas por extenso, no topo da folha. */}
      {simulated && (
        <div className="border-2 border-black py-1.5 mb-4">
          <p className="text-center text-[9pt] tracking-[0.22em] font-bold">
            DOCUMENTO SIMULADO — USO ACADEMICO
          </p>
          <p className="text-center text-[7.5pt] tracking-[0.16em] font-bold mt-0.5">
            SEM VALIDADE FISCAL — SEM EMISSAO SEFAZ
          </p>
        </div>
      )}
      <div className="flex items-start justify-between gap-8 pb-3 border-b-2 border-black">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 border-2 border-black flex items-center justify-center flex-none mt-0.5">
            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 4.5 8 1.5l6 3v7l-6 3-6-3z" fill="none" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 7.8v6.7M2 4.5l6 3.3 6-3.3" fill="none" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="text-[13pt] font-bold leading-tight" style={{ fontFamily: "var(--font-familjen)" }}>
              {WAREHOUSE.tradeName.split(" — ")[0]}
            </p>
            <p className="text-[8pt] leading-snug mt-0.5">{WAREHOUSE.tradeName}</p>
            <p className="text-[8pt] leading-snug">{WAREHOUSE.name}</p>
            <p className="text-[8pt] leading-snug">CNPJ {fmtCnpj(WAREHOUSE.cnpj)}</p>
            <p className="text-[8pt] leading-snug">
              {WAREHOUSE.address} — {WAREHOUSE.city}/{WAREHOUSE.state}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[15pt] font-bold leading-tight uppercase" style={{ fontFamily: "var(--font-familjen)" }}>
            {title}
          </p>
          {subtitle && <p className="text-[8.5pt] mt-0.5">{subtitle}</p>}
          <div className="flex items-center justify-end flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[8.5pt]">
            {number && <span className="whitespace-nowrap"><b>N.</b> {number}</span>}
            {issuedAt && <span className="whitespace-nowrap"><b>Emissao</b> {fmtDateTime(issuedAt)}</span>}
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-6 pt-3">
        <div className="flex-1">{extra}</div>
        {code && (
          <div className="text-right flex-none">
            <Barcode value={code} height={44} moduleWidth={1.7} fontSize={8} quietZone={8} />
          </div>
        )}
      </div>
    </header>
  );
}

export function DocSection({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-4 avoid-break ${className}`}>
      {title && (
        <h2 className="text-[8pt] font-bold tracking-[0.12em] uppercase border-b border-black pb-1 mb-2">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/** Grade de campos rotulados (emitente, destinatario, veiculo…). */
export function DocFields({
  fields, cols = 4,
}: { fields: { label: string; value: ReactNode; span?: number }[]; cols?: number }) {
  return (
    <dl className="grid gap-x-5 gap-y-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {fields.map((f, i) => (
        <div key={i} style={{ gridColumn: f.span ? `span ${f.span}` : undefined }}>
          <dt className="text-[6.8pt] tracking-[0.06em] uppercase text-[#555] break-words">{f.label}</dt>
          <dd className="text-[9pt] leading-snug break-words">{f.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DocTable({
  head, children, compact = false,
}: { head: { label: string; align?: "left" | "right" | "center"; width?: string }[]; children: ReactNode; compact?: boolean }) {
  return (
    <table className="w-full border-collapse text-[8.5pt]">
      <thead>
        <tr className="bg-[#EDEDED]">
          {head.map((h, i) => (
            <th
              key={i}
              className={`border border-[#999] px-1.5 ${compact ? "py-0.5" : "py-1"} font-bold text-[7.2pt] tracking-[0.05em] uppercase`}
              style={{ textAlign: h.align ?? "left", width: h.width }}
            >
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Td({
  children, align = "left", bold = false, colSpan,
}: { children: ReactNode; align?: "left" | "right" | "center"; bold?: boolean; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-[#999] px-1.5 py-1 align-top ${bold ? "font-bold" : ""}`}
      style={{ textAlign: align, fontVariantNumeric: "tabular-nums" }}
    >
      {children}
    </td>
  );
}

export function DocTotals({ rows }: { rows: { label: string; value: ReactNode; strong?: boolean }[] }) {
  return (
    <div className="flex justify-end mt-3 avoid-break">
      <table className="text-[9pt] border-collapse">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border border-[#999] bg-[#EDEDED] px-2.5 py-1 text-[7.2pt] tracking-[0.06em] uppercase font-bold">
                {r.label}
              </td>
              <td
                className={`border border-[#999] px-2.5 py-1 text-right ${r.strong ? "font-bold text-[10pt]" : ""}`}
                style={{ fontVariantNumeric: "tabular-nums", minWidth: "34mm" }}
              >
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocSignatures({ labels }: { labels: string[] }) {
  return (
    <section className="mt-10 avoid-break">
      <div className="grid gap-8" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0,1fr))` }}>
        {labels.map((l) => (
          <div key={l}>
            <div className="border-t border-black pt-1.5">
              <p className="text-[7.5pt] tracking-[0.08em] uppercase text-center">{l}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DocFooter({
  docId, note, simulated = false,
}: { docId: string; note?: string; simulated?: boolean }) {
  return (
    <footer className="mt-8 pt-2 border-t border-[#999] text-[7pt] leading-snug flex justify-between gap-4">
      <span>
        Documento gerado pelo WMS a partir dos registros da operacao · cenario {SCENARIO_ID} ·
        identificador {docId}
        {note ? ` · ${note}` : ""}
      </span>
      <span className="flex-none">
        {simulated ? "SIMULADO — SEM VALIDADE FISCAL" : "Uso interno"}
      </span>
    </footer>
  );
}

export { fmtCnpj, fmtAccessKey, fmtDate, fmtDateTime };
