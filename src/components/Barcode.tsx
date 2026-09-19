import { toSvg, isEncodable, type BarcodeSvgOptions } from "@/lib/barcode/code128";

/**
 * Codigo de barras Code 128 real, renderizado no servidor.
 * O valor codificado e exatamente o identificador da entidade — o mesmo
 * que a coletora devolve ao ler a etiqueta.
 */
export function Barcode({
  value,
  height = 52,
  moduleWidth = 2,
  showText = true,
  className = "",
  quietZone = 10,
  fontSize = 11,
}: {
  value: string;
  height?: number;
  moduleWidth?: number;
  showText?: boolean;
  className?: string;
  quietZone?: number;
  fontSize?: number;
}) {
  if (!value || !isEncodable(value)) {
    return (
      <span className="text-[11px] text-error" role="alert">
        Codigo nao codificavel: {value || "(vazio)"}
      </span>
    );
  }
  const opts: BarcodeSvgOptions = {
    height, moduleWidth, showText, quietZone, fontSize,
    background: "#FFFFFF", foreground: "#000000",
  };
  return (
    <span
      className={`inline-block bg-white rounded-[3px] p-1.5 leading-none ${className}`}
      // O simbolo e gerado localmente pelo codificador do proprio sistema.
      dangerouslySetInnerHTML={{ __html: toSvg(value, opts) }}
    />
  );
}
