/**
 * Codificador Code 128 (subconjunto B) — implementacao propria, sem dependencias.
 *
 * Gera simbolos REAIS, legiveis por leitores fisicos (coletora USB/HID).
 * Estrutura: QUIET ZONE | START B | dados | checksum | STOP | QUIET ZONE
 * Checksum = (104 + soma(posicao * valor)) mod 103
 */

/** Larguras de modulo (barra, espaco, barra, espaco, barra, espaco) por valor 0..106. */
const PATTERNS: string[] = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","141142","141241","114212","124112","124211","411212","421112",
  "421211","212141","214121","412121","111143","111341","131141","114113","114311","411113",
  "411311","113141","114131","211412","211214","211232","2331112",
];

const START_B = 104;
const STOP = 106;

export class Code128Error extends Error {}

/** Verdadeiro se todos os caracteres sao codificaveis em Code 128 B (ASCII 32..127). */
export function isEncodable(value: string): boolean {
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 127) return false;
  }
  return true;
}

/** Sequencia de valores Code128 (start + dados + checksum + stop). */
export function encodeValues(value: string): number[] {
  if (value.length === 0) throw new Code128Error("Valor vazio");
  if (!isEncodable(value)) {
    throw new Code128Error(`Valor nao codificavel em Code 128 B: "${value}"`);
  }
  const data = [...value].map((ch) => ch.charCodeAt(0) - 32);
  let sum = START_B;
  data.forEach((v, i) => {
    sum += v * (i + 1);
  });
  const check = sum % 103;
  return [START_B, ...data, check, STOP];
}

/**
 * Larguras alternadas comecando por BARRA.
 * Ex.: [2,1,2,2,2,2, ...] = barra 2, espaco 1, barra 2, ...
 */
export function encodeWidths(value: string): number[] {
  const widths: number[] = [];
  for (const v of encodeValues(value)) {
    for (const d of PATTERNS[v]) widths.push(Number(d));
  }
  return widths;
}

/** Total de modulos do simbolo (sem quiet zone). */
export function moduleCount(value: string): number {
  return encodeWidths(value).reduce((a, b) => a + b, 0);
}

export interface BarcodeSvgOptions {
  /** Largura de 1 modulo em px. 2 = leitura confiavel em impressao 300dpi. */
  moduleWidth?: number;
  /** Altura das barras em px. */
  height?: number;
  /** Modulos de zona muda em cada lado (minimo 10 pela norma). */
  quietZone?: number;
  /** Exibe o texto legivel abaixo do simbolo. */
  showText?: boolean;
  fontSize?: number;
  /** Cores — o simbolo e sempre impresso em preto sobre branco. */
  background?: string;
  foreground?: string;
  className?: string;
}

/** Renderiza o simbolo como SVG (string). */
export function toSvg(value: string, opts: BarcodeSvgOptions = {}): string {
  const {
    moduleWidth = 2,
    height = 60,
    quietZone = 10,
    showText = true,
    fontSize = 12,
    background = "#FFFFFF",
    foreground = "#000000",
    className = "",
  } = opts;

  const widths = encodeWidths(value);
  const modules = widths.reduce((a, b) => a + b, 0);
  const totalModules = modules + quietZone * 2;
  const width = totalModules * moduleWidth;
  const textGap = showText ? fontSize + 6 : 0;
  const totalHeight = height + textGap;

  const rects: string[] = [];
  let x = quietZone;
  let isBar = true;
  for (const w of widths) {
    if (isBar) {
      rects.push(
        `<rect x="${(x * moduleWidth).toFixed(2)}" y="0" width="${(w * moduleWidth).toFixed(2)}" height="${height}" fill="${foreground}"/>`,
      );
    }
    x += w;
    isBar = !isBar;
  }

  const text = showText
    ? `<text x="${(width / 2).toFixed(2)}" y="${totalHeight - 2}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" letter-spacing="1.5" fill="${foreground}">${escapeXml(value)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}" class="${className}" shape-rendering="crispEdges" role="img" aria-label="Codigo de barras ${escapeXml(value)}"><rect width="${width}" height="${totalHeight}" fill="${background}"/>${rects.join("")}${text}</svg>`;
}

/** SVG como data-URI (uso em <img src>). */
export function toDataUri(value: string, opts?: BarcodeSvgOptions): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(toSvg(value, opts))}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}
