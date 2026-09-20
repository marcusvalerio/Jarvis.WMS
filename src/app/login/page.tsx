import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile } from "@/domain/context";
import { ensureSeeded } from "@/domain/services/simulation";
import { WAREHOUSE, SCENARIO_ID, SCENARIO_NAME } from "@/seed/scenario";
import { LoginForm } from "./parts";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // O login e a unica porta aberta, entao e aqui que o cenario se monta num
  // banco vazio. Sem isto, um banco novo nao teria usuarios, ninguem
  // conseguiria entrar e nada seria semeado: um impasse.
  await ensureSeeded();

  // Quem ja tem sessao valida nao precisa ver o login de novo.
  if (await currentProfile()) redirect("/dashboard");

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10 grid-lines">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-6">
          <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-none">
            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 4.5 8 1.5l6 3v7l-6 3-6-3z" fill="none" stroke="var(--color-on-accent)" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M8 7.8v6.7M2 4.5l6 3.3 6-3.3" fill="none" stroke="var(--color-on-accent)" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-primary leading-tight font-[family-name:var(--font-display)]">
              {WAREHOUSE.tradeName.split(" — ")[0]}
            </p>
            <p className="text-[11.5px] text-faint leading-tight">{WAREHOUSE.tradeName}</p>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="text-[19px] font-semibold text-primary leading-tight font-[family-name:var(--font-display)]">
            Entrar na operacao
          </h1>
          <p className="text-[12.5px] text-secondary mt-1 mb-5 leading-relaxed">
            Use o seu e-mail da equipe. As movimentacoes que voce registrar
            ficam assinadas com o seu nome na auditoria.
          </p>
          <LoginForm />
        </div>

        <p className="text-[11.5px] text-faint mt-4 text-center leading-relaxed">
          {SCENARIO_ID} · {SCENARIO_NAME}<br />
          Ambiente academico de simulacao — nao emite documento fiscal real.
        </p>
      </div>
    </main>
  );
}
