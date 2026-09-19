import {
  IconDashboard, IconPulse, IconTruckIn, IconCart, IconBox, IconMap, IconPallet,
  IconPick, IconPack, IconTruckOut, IconDoc, IconCount, IconAlert, IconTool,
  IconShield, IconPlay, IconSettings, IconLink, IconGrid, IconWeight, IconScan,
} from "@/components/ui/Icons";
import type { ComponentType, SVGProps } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** Marca o item ativo tambem nas rotas filhas. */
  exact?: boolean;
  badgeKey?: "incidents" | "picking" | "receiving" | "orders";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Operacao",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: IconDashboard, exact: true },
      { href: "/operations", label: "Painel de operacao", icon: IconPulse },
    ],
  },
  {
    label: "Entrada",
    items: [
      { href: "/receiving", label: "Recebimento", icon: IconTruckIn, badgeKey: "receiving" },
      { href: "/receiving/weighing", label: "Pesagem", icon: IconWeight, exact: true },
      { href: "/purchasing", label: "Pedidos de compra", icon: IconCart },
    ],
  },
  {
    label: "Armazem",
    items: [
      { href: "/inventory", label: "Estoque", icon: IconBox, exact: true },
      { href: "/inventory/movements", label: "Movimentacoes", icon: IconGrid, exact: true },
      { href: "/warehouse", label: "Mapa do armazem", icon: IconMap, exact: true },
      { href: "/warehouse/storage", label: "Armazenagem", icon: IconPallet, exact: true },
      { href: "/warehouse/pallets", label: "Paletes", icon: IconPallet },
    ],
  },
  {
    label: "Saida",
    items: [
      { href: "/shipping/orders", label: "Pedidos de venda", icon: IconDoc, badgeKey: "orders" },
      { href: "/picking", label: "Picking", icon: IconPick, badgeKey: "picking" },
      { href: "/packing", label: "Packing", icon: IconPack },
      { href: "/shipping", label: "Expedicao", icon: IconTruckOut, exact: true },
      { href: "/shipping/manifests", label: "Romaneios", icon: IconDoc },
      { href: "/shipping/loading", label: "Carregamento", icon: IconTruckOut },
    ],
  },
  {
    label: "Controle",
    items: [
      { href: "/inventory-count", label: "Inventario", icon: IconCount },
      { href: "/incidents", label: "Ocorrencias", icon: IconAlert, badgeKey: "incidents" },
      { href: "/equipment", label: "Equipamentos", icon: IconTool },
      { href: "/documents", label: "Central de documentos", icon: IconDoc, exact: true },
      { href: "/audit/trace", label: "Rastreabilidade", icon: IconLink },
      { href: "/audit", label: "Auditoria", icon: IconShield, exact: true },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/simulation", label: "Simulacao", icon: IconPlay },
      { href: "/mobile", label: "Coletora / RF", icon: IconScan },
      { href: "/settings", label: "Configuracoes", icon: IconSettings },
    ],
  },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
