import { LookupTerminal } from "./parts";

export const metadata = { title: "Consulta" };
export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <>
      <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold mb-1">
        Consulta livre
      </h1>
      <p className="text-[13.5px] text-secondary mb-5 leading-snug">
        Bipe com a coletora ou leia com a camera do celular qualquer etiqueta: endereco, palete, produto, volume, pedido, romaneio ou operador.
      </p>
      <LookupTerminal />
    </>
  );
}
