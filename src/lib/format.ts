const TZ = "America/Sao_Paulo";

export function nowIso(): string {
  return new Date().toISOString();
}

export function iso(d: Date | string | number): string {
  return new Date(d).toISOString();
}

export function addDays(base: Date | string, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function addMinutes(base: Date | string, minutes: number): string {
  return new Date(new Date(base).getTime() + minutes * 60_000).toISOString();
}

export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(value));
}

export function fmtTime(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return "—";
  return `${fmtDate(value)} ${fmtTime(value)}`;
}

export function fmtNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value);
}

export function fmtQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? fmtNumber(value, 0) : fmtNumber(value, 3);
}

export function fmtWeight(kg: number | null | undefined, decimals = 3): string {
  if (kg === null || kg === undefined) return "—";
  return `${fmtNumber(kg, decimals)} kg`;
}

export function fmtMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
  }).format(value);
}

export function fmtPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${fmtNumber(value, decimals)}%`;
}

/** Duracao legivel a partir de minutos. */
export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "—";
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${fmtNumber(minutes, 0)}min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export function minutesBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  return (new Date(to).getTime() - new Date(from).getTime()) / 60_000;
}

export function fmtCnpj(cnpj?: string | null): string {
  if (!cnpj) return "—";
  const d = cnpj.replace(/\D/g, "").padStart(14, "0");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Chave de acesso simulada: grupos de 4 digitos. */
export function fmtAccessKey(key?: string | null): string {
  if (!key) return "—";
  return (key.match(/.{1,4}/g) ?? []).join(" ");
}

export function fmtDimensions(l?: number, w?: number, h?: number): string {
  if (!l && !w && !h) return "—";
  return `${fmtNumber(l ?? 0, 0)} × ${fmtNumber(w ?? 0, 0)} × ${fmtNumber(h ?? 0, 0)} cm`;
}

/** Arredonda para 3 casas — evita ruido de ponto flutuante em quantidades/pesos. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return (part / total) * 100;
}

export function relativeTime(value?: string | null): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.round(diff / 60_000);
  if (Math.abs(min) < 1) return "agora";
  if (Math.abs(min) < 60) return `ha ${min}min`;
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return `ha ${h}h`;
  return fmtDate(value);
}
