import { Sidebar, type NavCounts } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { currentOperator, listOperators } from "@/domain/context";
import { ensureSeeded, getScenario } from "@/domain/services/simulation";
import { scalar } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Primeira renderizacao carrega o cenario, para que nenhuma tela apareca vazia.
  ensureSeeded();

  const [operator, operators] = [await currentOperator(), listOperators()];
  const scenario = getScenario();

  const counts: NavCounts = {
    incidents: scalar<number>(`SELECT COUNT(*) FROM incidents WHERE status IN ('OPEN','IN_ANALYSIS')`) ?? 0,
    picking: scalar<number>(`SELECT COUNT(*) FROM picking_orders WHERE status IN ('PENDING','IN_PROGRESS')`) ?? 0,
    receiving: scalar<number>(`SELECT COUNT(*) FROM inbound_orders WHERE status NOT IN ('COMPLETED','CANCELLED')`) ?? 0,
    orders: scalar<number>(`SELECT COUNT(*) FROM sales_orders WHERE status NOT IN ('SHIPPED','CANCELLED')`) ?? 0,
  };

  return (
    <div className="flex min-h-dvh">
      <Sidebar counts={counts} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar
          operator={operator}
          operators={operators}
          scenario={scenario ? { id: scenario.id, name: scenario.name, status: scenario.status } : null}
        />
        <main className="flex-1 min-w-0 px-4 lg:px-6 py-6 fade-in">{children}</main>
      </div>
    </div>
  );
}
