/**
 * Estados operacionais centralizados.
 * Nenhuma string de estado deve ser escrita solta no codigo — sempre daqui.
 * Cada maquina de estados declara suas transicoes validas; o backend usa
 * `assertTransition` antes de qualquer mudanca.
 */

export type Tone = "neutral" | "accent" | "success" | "warning" | "error" | "info";

export interface StateMeta {
  label: string;
  tone: Tone;
  description?: string;
}

// ---------------------------------------------------------------- RECEBIMENTO
export const INBOUND_STATUS = {
  SCHEDULED: "SCHEDULED",
  ARRIVING: "ARRIVING",
  RECEIVING: "RECEIVING",
  CHECKING: "CHECKING",
  DIVERGENCE: "DIVERGENCE",
  APPROVED: "APPROVED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type InboundStatus = keyof typeof INBOUND_STATUS;

export const INBOUND_STATUS_META: Record<InboundStatus, StateMeta> = {
  SCHEDULED: { label: "Agendado", tone: "neutral", description: "Aguardando chegada do veiculo" },
  ARRIVING: { label: "Em portaria", tone: "info", description: "Veiculo chegou, aguardando doca" },
  RECEIVING: { label: "Recebendo", tone: "accent", description: "Descarga em andamento" },
  CHECKING: { label: "Em conferencia", tone: "accent", description: "Conferencia cega/fisica" },
  DIVERGENCE: { label: "Divergencia", tone: "warning", description: "Ha divergencia a tratar" },
  APPROVED: { label: "Aprovado", tone: "success", description: "Conferencia aprovada" },
  COMPLETED: { label: "Concluido", tone: "success", description: "Armazenagem finalizada" },
  CANCELLED: { label: "Cancelado", tone: "error" },
};

export const INBOUND_TRANSITIONS: Record<InboundStatus, InboundStatus[]> = {
  SCHEDULED: ["ARRIVING", "CANCELLED"],
  ARRIVING: ["RECEIVING", "CANCELLED"],
  RECEIVING: ["CHECKING", "CANCELLED"],
  CHECKING: ["APPROVED", "DIVERGENCE", "CANCELLED"],
  DIVERGENCE: ["APPROVED", "CHECKING", "CANCELLED"],
  APPROVED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// ---------------------------------------------------------------- ESTOQUE
export const STOCK_STATUS = {
  AVAILABLE: "AVAILABLE",
  RESERVED: "RESERVED",
  BLOCKED: "BLOCKED",
  IN_TRANSIT: "IN_TRANSIT",
} as const;
export type StockStatus = keyof typeof STOCK_STATUS;

export const STOCK_STATUS_META: Record<StockStatus, StateMeta> = {
  AVAILABLE: { label: "Disponivel", tone: "success" },
  RESERVED: { label: "Reservado", tone: "warning" },
  BLOCKED: { label: "Bloqueado", tone: "error" },
  IN_TRANSIT: { label: "Em movimentacao", tone: "info" },
};

// ---------------------------------------------------------------- PICKING
export const PICKING_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  DIVERGENCE: "DIVERGENCE",
  CANCELLED: "CANCELLED",
} as const;
export type PickingStatus = keyof typeof PICKING_STATUS;

export const PICKING_STATUS_META: Record<PickingStatus, StateMeta> = {
  PENDING: { label: "Pendente", tone: "neutral" },
  IN_PROGRESS: { label: "Em execucao", tone: "accent" },
  COMPLETED: { label: "Concluido", tone: "success" },
  DIVERGENCE: { label: "Divergencia", tone: "warning" },
  CANCELLED: { label: "Cancelado", tone: "error" },
};

export const PICKING_TRANSITIONS: Record<PickingStatus, PickingStatus[]> = {
  PENDING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "DIVERGENCE", "CANCELLED"],
  DIVERGENCE: ["COMPLETED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const PICKING_ITEM_STATUS = {
  PENDING: "PENDING",
  LOCATION_SCANNED: "LOCATION_SCANNED",
  PRODUCT_SCANNED: "PRODUCT_SCANNED",
  COMPLETED: "COMPLETED",
  DIVERGENCE: "DIVERGENCE",
  SKIPPED: "SKIPPED",
} as const;
export type PickingItemStatus = keyof typeof PICKING_ITEM_STATUS;

export const PICKING_ITEM_STATUS_META: Record<PickingItemStatus, StateMeta> = {
  PENDING: { label: "Aguardando endereco", tone: "neutral" },
  LOCATION_SCANNED: { label: "Endereco confirmado", tone: "info" },
  PRODUCT_SCANNED: { label: "Produto confirmado", tone: "info" },
  COMPLETED: { label: "Coletado", tone: "success" },
  DIVERGENCE: { label: "Divergencia", tone: "warning" },
  SKIPPED: { label: "Pulado", tone: "warning" },
};

// ---------------------------------------------------------------- EXPEDICAO
export const SHIPPING_STATUS = {
  PENDING: "PENDING",
  PICKING: "PICKING",
  CHECKING: "CHECKING",
  READY_TO_LOAD: "READY_TO_LOAD",
  LOADING: "LOADING",
  LOADED: "LOADED",
  SHIPPED: "SHIPPED",
  CANCELLED: "CANCELLED",
} as const;
export type ShippingStatus = keyof typeof SHIPPING_STATUS;

export const SHIPPING_STATUS_META: Record<ShippingStatus, StateMeta> = {
  PENDING: { label: "Pendente", tone: "neutral", description: "Aguardando liberacao/reserva" },
  PICKING: { label: "Em separacao", tone: "accent" },
  CHECKING: { label: "Em conferencia", tone: "accent" },
  READY_TO_LOAD: { label: "Pronto p/ carregar", tone: "info" },
  LOADING: { label: "Carregando", tone: "accent" },
  LOADED: { label: "Carregado", tone: "info" },
  SHIPPED: { label: "Expedido", tone: "success" },
  CANCELLED: { label: "Cancelado", tone: "error" },
};

export const SHIPPING_TRANSITIONS: Record<ShippingStatus, ShippingStatus[]> = {
  PENDING: ["PICKING", "CANCELLED"],
  PICKING: ["CHECKING", "CANCELLED"],
  CHECKING: ["READY_TO_LOAD", "PICKING", "CANCELLED"],
  READY_TO_LOAD: ["LOADING", "CANCELLED"],
  LOADING: ["LOADED", "CANCELLED"],
  LOADED: ["SHIPPED", "CANCELLED"],
  SHIPPED: [],
  CANCELLED: [],
};

/** Etapas visiveis na tela de operacao, na ordem do fluxo fisico. */
export const SHIPPING_FLOW: ShippingStatus[] = [
  "PENDING", "PICKING", "CHECKING", "READY_TO_LOAD", "LOADING", "LOADED", "SHIPPED",
];

// ---------------------------------------------------------------- COMPRAS
export const PURCHASE_STATUS = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  CONFIRMED: "CONFIRMED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  RECEIVED: "RECEIVED",
  CANCELLED: "CANCELLED",
} as const;
export type PurchaseStatus = keyof typeof PURCHASE_STATUS;

export const PURCHASE_STATUS_META: Record<PurchaseStatus, StateMeta> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  SENT: { label: "Enviado", tone: "info" },
  CONFIRMED: { label: "Confirmado", tone: "accent" },
  PARTIALLY_RECEIVED: { label: "Recebido parcial", tone: "warning" },
  RECEIVED: { label: "Recebido", tone: "success" },
  CANCELLED: { label: "Cancelado", tone: "error" },
};

// ---------------------------------------------------------------- ENDERECOS
export const LOCATION_STATUS = {
  AVAILABLE: "AVAILABLE",
  OCCUPIED: "OCCUPIED",
  RESERVED: "RESERVED",
  BLOCKED: "BLOCKED",
  MOVING: "MOVING",
} as const;
export type LocationStatus = keyof typeof LOCATION_STATUS;

export const LOCATION_STATUS_META: Record<LocationStatus, StateMeta> = {
  AVAILABLE: { label: "Livre", tone: "neutral" },
  OCCUPIED: { label: "Ocupado", tone: "accent" },
  RESERVED: { label: "Reservado", tone: "warning" },
  BLOCKED: { label: "Bloqueado", tone: "error" },
  MOVING: { label: "Em movimentacao", tone: "info" },
};

// ---------------------------------------------------------------- PALETE
export const PALLET_STATUS = {
  BUILDING: "BUILDING",
  AWAITING_PUTAWAY: "AWAITING_PUTAWAY",
  STORED: "STORED",
  PICKING: "PICKING",
  CONSUMED: "CONSUMED",
  SHIPPED: "SHIPPED",
  BLOCKED: "BLOCKED",
} as const;
export type PalletStatus = keyof typeof PALLET_STATUS;

export const PALLET_STATUS_META: Record<PalletStatus, StateMeta> = {
  BUILDING: { label: "Em montagem", tone: "neutral" },
  AWAITING_PUTAWAY: { label: "Aguardando armazenagem", tone: "warning" },
  STORED: { label: "Armazenado", tone: "success" },
  PICKING: { label: "Em separacao", tone: "accent" },
  CONSUMED: { label: "Consumido", tone: "neutral" },
  SHIPPED: { label: "Expedido", tone: "info" },
  BLOCKED: { label: "Bloqueado", tone: "error" },
};

// ---------------------------------------------------------------- VOLUME
export const VOLUME_STATUS = {
  // PLANNED e o volume que existe como linha do banco e como etiqueta
  // impressa, mas que ainda nao foi embalado. Nenhuma operacao (conferencia,
  // carregamento, expedicao) enxerga um volume nesse estado: ele so entra no
  // fluxo quando a embalagem o reivindica e o move para OPEN.
  PLANNED: "PLANNED",
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  CHECKED: "CHECKED",
  LOADED: "LOADED",
  SHIPPED: "SHIPPED",
  CANCELLED: "CANCELLED",
} as const;
export type VolumeStatus = keyof typeof VOLUME_STATUS;

export const VOLUME_STATUS_META: Record<VolumeStatus, StateMeta> = {
  PLANNED: { label: "Planejado", tone: "warning" },
  OPEN: { label: "Aberto", tone: "neutral" },
  CLOSED: { label: "Fechado", tone: "info" },
  CHECKED: { label: "Conferido", tone: "success" },
  LOADED: { label: "Carregado", tone: "accent" },
  SHIPPED: { label: "Expedido", tone: "success" },
  CANCELLED: { label: "Cancelado", tone: "error" },
};

// ---------------------------------------------------------------- ROMANEIO
export const MANIFEST_STATUS = {
  DRAFT: "DRAFT",
  READY: "READY",
  LOADING: "LOADING",
  LOADED: "LOADED",
  SHIPPED: "SHIPPED",
  CANCELLED: "CANCELLED",
} as const;
export type ManifestStatus = keyof typeof MANIFEST_STATUS;

export const MANIFEST_STATUS_META: Record<ManifestStatus, StateMeta> = {
  DRAFT: { label: "Em montagem", tone: "neutral" },
  READY: { label: "Liberado", tone: "info" },
  LOADING: { label: "Carregando", tone: "accent" },
  LOADED: { label: "Carregado", tone: "info" },
  SHIPPED: { label: "Expedido", tone: "success" },
  CANCELLED: { label: "Cancelado", tone: "error" },
};

export const MANIFEST_TRANSITIONS: Record<ManifestStatus, ManifestStatus[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["LOADING", "DRAFT", "CANCELLED"],
  LOADING: ["LOADED", "CANCELLED"],
  LOADED: ["SHIPPED", "CANCELLED"],
  SHIPPED: [],
  CANCELLED: [],
};

// ---------------------------------------------------------------- GENERICOS
export const TASK_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  DIVERGENCE: "DIVERGENCE",
  CANCELLED: "CANCELLED",
} as const;
export type TaskStatus = keyof typeof TASK_STATUS;

export const TASK_STATUS_META: Record<TaskStatus, StateMeta> = {
  PENDING: { label: "Pendente", tone: "neutral" },
  IN_PROGRESS: { label: "Em execucao", tone: "accent" },
  COMPLETED: { label: "Concluido", tone: "success" },
  DIVERGENCE: { label: "Divergencia", tone: "warning" },
  CANCELLED: { label: "Cancelado", tone: "error" },
};

export const CHECK_STATUS = {
  IN_PROGRESS: "IN_PROGRESS",
  OK: "OK",
  DIVERGENCE: "DIVERGENCE",
  CLOSED: "CLOSED",
} as const;
export type CheckStatus = keyof typeof CHECK_STATUS;

export const CHECK_STATUS_META: Record<CheckStatus, StateMeta> = {
  IN_PROGRESS: { label: "Em conferencia", tone: "accent" },
  OK: { label: "Conferido OK", tone: "success" },
  DIVERGENCE: { label: "Divergencia", tone: "warning" },
  CLOSED: { label: "Encerrada", tone: "neutral" },
};

// ---------------------------------------------------------------- EQUIPAMENTO
export const EQUIPMENT_STATUS = {
  AVAILABLE: "AVAILABLE",
  IN_USE: "IN_USE",
  MAINTENANCE: "MAINTENANCE",
  UNAVAILABLE: "UNAVAILABLE",
} as const;
export type EquipmentStatus = keyof typeof EQUIPMENT_STATUS;

export const EQUIPMENT_STATUS_META: Record<EquipmentStatus, StateMeta> = {
  AVAILABLE: { label: "Disponivel", tone: "success" },
  IN_USE: { label: "Em uso", tone: "accent" },
  MAINTENANCE: { label: "Manutencao", tone: "warning" },
  UNAVAILABLE: { label: "Indisponivel", tone: "error" },
};

export const EQUIPMENT_KIND = {
  COLETORA: "COLETORA",
  EMPILHADEIRA: "EMPILHADEIRA",
  PALETEIRA: "PALETEIRA",
  IMPRESSORA: "IMPRESSORA",
  BALANCA: "BALANCA",
} as const;
export type EquipmentKind = keyof typeof EQUIPMENT_KIND;

// ---------------------------------------------------------------- OCORRENCIAS
export const INCIDENT_KIND = {
  RECEIVING_DIVERGENCE: "RECEIVING_DIVERGENCE",
  DAMAGED_PRODUCT: "DAMAGED_PRODUCT",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  PICKING_ERROR: "PICKING_ERROR",
  LOCATION_OCCUPIED: "LOCATION_OCCUPIED",
  DAMAGED_PACKAGING: "DAMAGED_PACKAGING",
  EQUIPMENT_UNAVAILABLE: "EQUIPMENT_UNAVAILABLE",
  SHIPPING_DIVERGENCE: "SHIPPING_DIVERGENCE",
  COUNT_DIVERGENCE: "COUNT_DIVERGENCE",
  WEIGHT_DIVERGENCE: "WEIGHT_DIVERGENCE",
} as const;
export type IncidentKind = keyof typeof INCIDENT_KIND;

export const INCIDENT_KIND_LABEL: Record<IncidentKind, string> = {
  RECEIVING_DIVERGENCE: "Divergencia de recebimento",
  DAMAGED_PRODUCT: "Produto avariado",
  PRODUCT_NOT_FOUND: "Produto nao localizado",
  PICKING_ERROR: "Erro de picking",
  LOCATION_OCCUPIED: "Endereco ocupado",
  DAMAGED_PACKAGING: "Embalagem danificada",
  EQUIPMENT_UNAVAILABLE: "Equipamento indisponivel",
  SHIPPING_DIVERGENCE: "Divergencia de expedicao",
  COUNT_DIVERGENCE: "Divergencia de inventario",
  WEIGHT_DIVERGENCE: "Divergencia de pesagem",
};

export const INCIDENT_STATUS = {
  OPEN: "OPEN",
  IN_ANALYSIS: "IN_ANALYSIS",
  RESOLVED: "RESOLVED",
  CANCELLED: "CANCELLED",
} as const;
export type IncidentStatus = keyof typeof INCIDENT_STATUS;

export const INCIDENT_STATUS_META: Record<IncidentStatus, StateMeta> = {
  OPEN: { label: "Aberta", tone: "error" },
  IN_ANALYSIS: { label: "Em analise", tone: "warning" },
  RESOLVED: { label: "Resolvida", tone: "success" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
};

export const SEVERITY = { BAIXA: "BAIXA", MEDIA: "MEDIA", ALTA: "ALTA", CRITICA: "CRITICA" } as const;
export type Severity = keyof typeof SEVERITY;
export const SEVERITY_META: Record<Severity, StateMeta> = {
  BAIXA: { label: "Baixa", tone: "neutral" },
  MEDIA: { label: "Media", tone: "info" },
  ALTA: { label: "Alta", tone: "warning" },
  CRITICA: { label: "Critica", tone: "error" },
};

// ---------------------------------------------------------------- MOVIMENTOS
export const MOVEMENT_KIND = {
  RECEIPT: "RECEIPT",
  PUTAWAY: "PUTAWAY",
  TRANSFER: "TRANSFER",
  PICK: "PICK",
  PACK: "PACK",
  SHIP: "SHIP",
  ADJUSTMENT: "ADJUSTMENT",
  COUNT: "COUNT",
  BLOCK: "BLOCK",
  UNBLOCK: "UNBLOCK",
  RETURN: "RETURN",
} as const;
export type MovementKind = keyof typeof MOVEMENT_KIND;

export const MOVEMENT_KIND_LABEL: Record<MovementKind, string> = {
  RECEIPT: "Entrada por recebimento",
  PUTAWAY: "Armazenagem",
  TRANSFER: "Transferencia interna",
  PICK: "Separacao",
  PACK: "Embalagem",
  SHIP: "Expedicao",
  ADJUSTMENT: "Ajuste",
  COUNT: "Inventario",
  BLOCK: "Bloqueio",
  UNBLOCK: "Desbloqueio",
  RETURN: "Devolucao",
};

/** Movimentos que aumentam (+1) ou reduzem (-1) o saldo fisico do armazem. */
export const MOVEMENT_SIGN: Record<MovementKind, 1 | -1 | 0> = {
  RECEIPT: 1, PUTAWAY: 0, TRANSFER: 0, PICK: 0, PACK: 0,
  SHIP: -1, ADJUSTMENT: 0, COUNT: 0, BLOCK: 0, UNBLOCK: 0, RETURN: 1,
};

// ---------------------------------------------------------------- PRIORIDADE
export const PRIORITY = { URGENTE: "URGENTE", ALTA: "ALTA", NORMAL: "NORMAL", BAIXA: "BAIXA" } as const;
export type Priority = keyof typeof PRIORITY;
export const PRIORITY_META: Record<Priority, StateMeta> = {
  URGENTE: { label: "Urgente", tone: "error" },
  ALTA: { label: "Alta", tone: "warning" },
  NORMAL: { label: "Normal", tone: "neutral" },
  BAIXA: { label: "Baixa", tone: "neutral" },
};
export const PRIORITY_RANK: Record<Priority, number> = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAIXA: 3 };

// ---------------------------------------------------------------- AUDITORIA
export const AUDIT_ACTION = {
  CREATE: "CREATE", UPDATE: "UPDATE", APPROVE: "APPROVE", CANCEL: "CANCEL",
  RECEIVE: "RECEIVE", CHECK: "CHECK", MOVE: "MOVE", PICK: "PICK", PACK: "PACK",
  LOAD: "LOAD", SHIP: "SHIP", RESET: "RESET", COUNT: "COUNT", WEIGH: "WEIGH",
  RESERVE: "RESERVE", RELEASE: "RELEASE", SCAN: "SCAN", SEED: "SEED",
} as const;
export type AuditAction = keyof typeof AUDIT_ACTION;

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "Criacao", UPDATE: "Alteracao", APPROVE: "Aprovacao", CANCEL: "Cancelamento",
  RECEIVE: "Recebimento", CHECK: "Conferencia", MOVE: "Movimentacao", PICK: "Picking",
  PACK: "Packing", LOAD: "Carregamento", SHIP: "Expedicao", RESET: "Reset da simulacao",
  COUNT: "Inventario", WEIGH: "Pesagem", RESERVE: "Reserva", RELEASE: "Liberacao",
  SCAN: "Leitura de codigo", SEED: "Carga inicial",
};

// ---------------------------------------------------------------- VALIDACAO
export class TransitionError extends Error {
  readonly entity: string;
  readonly from: string;
  readonly to: string;
  constructor(entity: string, from: string, to: string) {
    super(`Transicao invalida em ${entity}: ${from} -> ${to}`);
    this.name = "TransitionError";
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

export function canTransition<S extends string>(
  map: Record<S, S[]>,
  from: S,
  to: S,
): boolean {
  return (map[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(
  entity: string,
  map: Record<S, S[]>,
  from: S,
  to: S,
): void {
  if (from === to) return;
  if (!canTransition(map, from, to)) throw new TransitionError(entity, from, to);
}
