-- =====================================================================
-- JARVIS WMS — Esquema operacional (PostgreSQL / Neon)
-- Traduzido do esquema SQLite original preservando tabelas, colunas,
-- chaves, indices e semantica:
--   INTEGER -> integer          (flags 0/1 seguem inteiras, para que a
--                                logica de dominio nao mude)
--   REAL    -> double precision (NUNCA numeric: o driver devolveria string
--                                e quebraria pesos, precos e quantidades)
--   TEXT    -> text             (datas seguem em ISO-8601 UTC, como antes)
-- Chaves primarias continuam sendo os identificadores impressos em codigo
-- de barras (PLT-000001, END-A020301, PED-000125).
-- Idempotente: pode ser aplicado repetidamente sobre o mesmo banco.
-- =====================================================================

-- ---------------------------------------------------------------- PESSOAS
CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  role          text NOT NULL,              -- ADMIN | SUPERVISOR | OPERATOR | VIEWER
  active        integer NOT NULL DEFAULT 1,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS operators (
  id            text PRIMARY KEY,           -- OPR-0001
  user_id       text,
  name          text NOT NULL,
  badge         text NOT NULL UNIQUE,       -- codigo de barras do cracha
  shift         text NOT NULL,              -- MANHA | TARDE | NOITE
  active        integer NOT NULL DEFAULT 1,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id            text PRIMARY KEY,           -- FOR-0001
  name          text NOT NULL,
  trade_name    text,
  cnpj          text NOT NULL,              -- ficticio (simulacao)
  ie            text,
  address       text, city text, state text, zip text,
  phone         text, email text,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id            text PRIMARY KEY,           -- CLI-0001
  name          text NOT NULL,
  trade_name    text,
  cnpj          text NOT NULL,
  ie            text,
  address       text, city text, state text, zip text,
  phone         text, email text,
  created_at    text NOT NULL
);

-- ---------------------------------------------------------------- PRODUTO
CREATE TABLE IF NOT EXISTS products (
  id            text PRIMARY KEY,           -- SKU-001
  sku           text NOT NULL UNIQUE,
  description   text NOT NULL,
  category      text NOT NULL,
  unit          text NOT NULL,              -- CX | UN | PC
  ncm           text,
  cfop_in       text, cfop_out text,
  unit_weight_kg   double precision NOT NULL DEFAULT 0, -- peso liquido por unidade
  unit_gross_kg    double precision NOT NULL DEFAULT 0,
  length_cm     double precision DEFAULT 0, width_cm double precision DEFAULT 0, height_cm double precision DEFAULT 0,
  units_per_pallet integer NOT NULL DEFAULT 40,
  unit_price    double precision NOT NULL DEFAULT 0,
  lot_controlled   integer NOT NULL DEFAULT 1,
  shelf_life_days  integer,
  min_stock     integer NOT NULL DEFAULT 0,
  abc_class     text NOT NULL DEFAULT 'B',  -- A | B | C (define zona preferencial)
  active        integer NOT NULL DEFAULT 1,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id            text PRIMARY KEY,
  product_id    text NOT NULL,
  code          text NOT NULL UNIQUE,       -- valor lido pela coletora
  symbology     text NOT NULL DEFAULT 'CODE128',
  kind          text NOT NULL DEFAULT 'INTERNAL', -- INTERNAL | EAN13 | DUN14
  is_primary    integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pb_product ON product_barcodes(product_id);

CREATE TABLE IF NOT EXISTS lots (
  id            text PRIMARY KEY,           -- LOT-000001
  product_id    text NOT NULL,
  code          text NOT NULL,              -- L2409A
  manufactured_at text,
  expires_at    text,
  supplier_id   text,
  created_at    text NOT NULL,
  UNIQUE(product_id, code)
);

-- ---------------------------------------------------------------- ARMAZEM
CREATE TABLE IF NOT EXISTS warehouses (
  id            text PRIMARY KEY,           -- CD-01
  name          text NOT NULL,
  cnpj          text,                       -- ficticio (simulacao)
  ie            text,
  address       text, city text, state text, zip text,
  phone         text,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS zones (
  id            text PRIMARY KEY,           -- A
  warehouse_id  text NOT NULL,
  code          text NOT NULL,
  name          text NOT NULL,
  kind          text NOT NULL,              -- PICKING | STORAGE | RECEIVING | SHIPPING | QUARANTINE
  temperature   text NOT NULL DEFAULT 'AMBIENTE',
  abc_class     text DEFAULT NULL,
  sort_order    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS locations (
  id            text PRIMARY KEY,           -- END-A020301
  code          text NOT NULL UNIQUE,       -- A-02-03-01
  warehouse_id  text NOT NULL,
  zone_id       text NOT NULL,
  aisle         text NOT NULL,              -- corredor 02
  rack          text NOT NULL,              -- modulo 03
  level         text NOT NULL,              -- nivel 01
  position      text NOT NULL DEFAULT '01', -- posicao
  kind          text NOT NULL DEFAULT 'PALLET', -- PALLET | SHELF | FLOOR | DOCK | STAGING
  status        text NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE|OCCUPIED|RESERVED|BLOCKED|MOVING
  capacity_pallets integer NOT NULL DEFAULT 1,
  capacity_units   integer NOT NULL DEFAULT 0,
  max_weight_kg double precision NOT NULL DEFAULT 1000,
  pick_sequence integer NOT NULL DEFAULT 0, -- ordem de rota de picking
  blocked_reason text,
  created_at    text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loc_zone ON locations(zone_id);
CREATE INDEX IF NOT EXISTS idx_loc_status ON locations(status);

CREATE TABLE IF NOT EXISTS docks (
  id            text PRIMARY KEY,           -- DOCA-01
  warehouse_id  text NOT NULL,
  name          text NOT NULL,
  kind          text NOT NULL,              -- INBOUND | OUTBOUND | BOTH
  status        text NOT NULL DEFAULT 'FREE', -- FREE | OCCUPIED | BLOCKED
  current_ref   text
);

-- ---------------------------------------------------------------- UNITIZACAO
CREATE TABLE IF NOT EXISTS pallets (
  id            text PRIMARY KEY,           -- PLT-000001
  kind          text NOT NULL DEFAULT 'PBR', -- PBR | CHEP | DESCARTAVEL
  status        text NOT NULL,              -- BUILDING|AWAITING_PUTAWAY|STORED|PICKING|CONSUMED|SHIPPED|BLOCKED
  location_id   text,
  origin_kind   text NOT NULL,              -- RECEIVING | INITIAL_STOCK | REPACK
  origin_ref    text,                       -- OR-..., SIM-001
  tare_kg       double precision NOT NULL DEFAULT 25,
  gross_weight_kg double precision NOT NULL DEFAULT 0,
  net_weight_kg double precision NOT NULL DEFAULT 0,
  created_at    text NOT NULL,
  stored_at     text,
  created_by    text
);
CREATE INDEX IF NOT EXISTS idx_pallet_loc ON pallets(location_id);

CREATE TABLE IF NOT EXISTS pallet_items (
  id            text PRIMARY KEY,
  pallet_id     text NOT NULL,
  product_id    text NOT NULL,
  lot_id        text,
  quantity      double precision NOT NULL,
  UNIQUE(pallet_id, product_id, lot_id)
);

CREATE TABLE IF NOT EXISTS volumes (
  id            text PRIMARY KEY,           -- VOL-000001
  sales_order_id text,
  packing_order_id text,
  shipment_id   text,
  sequence      integer NOT NULL DEFAULT 1,
  container_kind text NOT NULL DEFAULT 'CAIXA', -- CAIXA | PALETE | ENVELOPE
  length_cm     double precision NOT NULL DEFAULT 40,
  width_cm      double precision NOT NULL DEFAULT 30,
  height_cm     double precision NOT NULL DEFAULT 30,
  tare_kg       double precision NOT NULL DEFAULT 0.4,
  net_weight_kg double precision NOT NULL DEFAULT 0,
  gross_weight_kg double precision NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'OPEN', -- OPEN|CLOSED|CHECKED|LOADED|SHIPPED|CANCELLED
  checked_at    text, loaded_at text,
  created_at    text NOT NULL,
  created_by    text
);
CREATE INDEX IF NOT EXISTS idx_vol_order ON volumes(sales_order_id);

CREATE TABLE IF NOT EXISTS volume_items (
  id            text PRIMARY KEY,
  volume_id     text NOT NULL,
  product_id    text NOT NULL,
  lot_id        text,
  quantity      double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_volitem_vol ON volume_items(volume_id);

-- ---------------------------------------------------------------- COMPRAS
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            text PRIMARY KEY,           -- PC-000001
  supplier_id   text NOT NULL,
  issued_at     text NOT NULL,
  expected_at   text NOT NULL,
  status        text NOT NULL,              -- DRAFT|SENT|CONFIRMED|PARTIALLY_RECEIVED|RECEIVED|CANCELLED
  buyer         text,
  payment_terms text,
  total_value   double precision NOT NULL DEFAULT 0,
  total_weight_kg double precision NOT NULL DEFAULT 0,
  notes         text,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id            text PRIMARY KEY,
  purchase_order_id text NOT NULL,
  line_no       integer NOT NULL,
  product_id    text NOT NULL,
  quantity      double precision NOT NULL,
  unit          text NOT NULL,
  unit_price    double precision NOT NULL,
  lot_code      text,
  expires_at    text,
  weight_kg     double precision NOT NULL DEFAULT 0,
  received_qty  double precision NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(purchase_order_id);

-- ---------------------------------------------------------------- RECEBIMENTO
CREATE TABLE IF NOT EXISTS inbound_orders (
  id            text PRIMARY KEY,           -- OR-000001
  purchase_order_id text,
  supplier_id   text NOT NULL,
  invoice_id    text,
  warehouse_id  text NOT NULL,
  dock_id       text,
  status        text NOT NULL,              -- SCHEDULED|ARRIVING|RECEIVING|CHECKING|DIVERGENCE|APPROVED|COMPLETED|CANCELLED
  scheduled_at  text NOT NULL,
  arrived_at    text, started_at text, checked_at text, completed_at text,
  vehicle_plate text, vehicle_kind text,
  driver_name   text, driver_doc text,
  carrier       text,
  expected_volumes  integer NOT NULL DEFAULT 0,
  expected_weight_kg double precision NOT NULL DEFAULT 0,
  received_volumes  integer NOT NULL DEFAULT 0,
  operator_id   text,
  notes         text,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_order_items (
  id            text PRIMARY KEY,
  inbound_order_id text NOT NULL,
  line_no       integer NOT NULL,
  product_id    text NOT NULL,
  lot_code      text,
  expires_at    text,
  expected_qty  double precision NOT NULL,
  checked_qty   double precision NOT NULL DEFAULT 0,
  accepted_qty  double precision NOT NULL DEFAULT 0,
  rejected_qty  double precision NOT NULL DEFAULT 0,
  unit          text NOT NULL,
  status        text NOT NULL DEFAULT 'PENDING' -- PENDING|CHECKING|OK|DIVERGENCE
);
CREATE INDEX IF NOT EXISTS idx_ioi_order ON inbound_order_items(inbound_order_id);

-- Nota fiscal SIMULADA (uso academico)
CREATE TABLE IF NOT EXISTS invoices (
  id            text PRIMARY KEY,           -- NFS-000001
  number        text NOT NULL,
  series        text NOT NULL DEFAULT '001',
  access_key    text NOT NULL,              -- chave simulada 44 digitos
  issued_at     text NOT NULL,
  kind          text NOT NULL,              -- INBOUND | OUTBOUND
  issuer_kind   text NOT NULL,              -- SUPPLIER | WAREHOUSE
  issuer_id     text NOT NULL,
  recipient_kind text NOT NULL,
  recipient_id  text NOT NULL,
  nature_op     text NOT NULL,
  total_products double precision NOT NULL DEFAULT 0,
  total_invoice double precision NOT NULL DEFAULT 0,
  total_weight_kg double precision NOT NULL DEFAULT 0,
  total_volumes integer NOT NULL DEFAULT 0,
  inbound_order_id text,
  sales_order_id text,
  simulated     integer NOT NULL DEFAULT 1,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id            text PRIMARY KEY,
  invoice_id    text NOT NULL,
  line_no       integer NOT NULL,
  product_id    text NOT NULL,
  description   text NOT NULL,
  ncm           text, cfop text,
  unit          text NOT NULL,
  quantity      double precision NOT NULL,
  unit_price    double precision NOT NULL,
  total_price   double precision NOT NULL,
  weight_kg     double precision NOT NULL DEFAULT 0,
  lot_code      text, expires_at text
);
CREATE INDEX IF NOT EXISTS idx_invit_inv ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS weighings (
  id            text PRIMARY KEY,           -- PES-000001
  ref_kind      text NOT NULL,              -- INBOUND_ORDER | PALLET | VOLUME | SHIPMENT
  ref_id        text NOT NULL,
  gross_kg      double precision NOT NULL,
  tare_kg       double precision NOT NULL,
  net_kg        double precision NOT NULL,
  expected_kg   double precision,
  divergence_kg double precision NOT NULL DEFAULT 0,
  equipment_id  text,
  operator_id   text,
  weighed_at    text NOT NULL,
  notes         text
);
CREATE INDEX IF NOT EXISTS idx_weigh_ref ON weighings(ref_kind, ref_id);

CREATE TABLE IF NOT EXISTS receiving_checks (
  id            text PRIMARY KEY,           -- CONF-000001
  inbound_order_id text NOT NULL,
  operator_id   text,
  status        text NOT NULL,              -- IN_PROGRESS | OK | DIVERGENCE | CLOSED
  started_at    text NOT NULL,
  finished_at   text,
  total_expected double precision NOT NULL DEFAULT 0,
  total_checked double precision NOT NULL DEFAULT 0,
  divergence_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS receiving_check_items (
  id            text PRIMARY KEY,
  check_id      text NOT NULL,
  inbound_item_id text NOT NULL,
  product_id    text NOT NULL,
  lot_code      text, expires_at text,
  expected_qty  double precision NOT NULL,
  checked_qty   double precision NOT NULL DEFAULT 0,
  divergence    double precision NOT NULL DEFAULT 0,
  pallet_id     text,
  status        text NOT NULL DEFAULT 'PENDING',
  checked_at    text,
  operator_id   text
);
CREATE INDEX IF NOT EXISTS idx_rci_check ON receiving_check_items(check_id);

-- ---------------------------------------------------------------- ESTOQUE
CREATE TABLE IF NOT EXISTS inventory (
  id            text PRIMARY KEY,
  product_id    text NOT NULL,
  lot_id        text,
  location_id   text NOT NULL,
  pallet_id     text,
  qty_on_hand   double precision NOT NULL DEFAULT 0,
  qty_reserved  double precision NOT NULL DEFAULT 0,
  qty_blocked   double precision NOT NULL DEFAULT 0,
  qty_in_transit double precision NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE|RESERVED|BLOCKED|IN_TRANSIT
  weight_kg     double precision NOT NULL DEFAULT 0,
  received_at   text,
  updated_at    text NOT NULL,
  UNIQUE(product_id, lot_id, location_id, pallet_id)
);
CREATE INDEX IF NOT EXISTS idx_inv_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_loc ON inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_pallet ON inventory(pallet_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            text PRIMARY KEY,           -- MOV-000001
  kind          text NOT NULL,              -- RECEIPT|PUTAWAY|TRANSFER|PICK|PACK|SHIP|ADJUSTMENT|COUNT|BLOCK|UNBLOCK|RETURN
  product_id    text NOT NULL,
  lot_id        text,
  quantity      double precision NOT NULL,              -- sempre positiva; direcao dada por from/to
  unit          text NOT NULL DEFAULT 'CX',
  from_location_id text,
  to_location_id   text,
  pallet_id     text,
  ref_kind      text,                       -- INBOUND_ORDER|SALES_ORDER|PICKING|PACKING|SHIPMENT|COUNT|MANUAL
  ref_id        text,
  reason        text,
  operator_id   text,
  balance_after double precision,                       -- saldo do produto apos o movimento
  weight_kg     double precision NOT NULL DEFAULT 0,
  occurred_at   text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mov_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_mov_ref ON inventory_movements(ref_kind, ref_id);
CREATE INDEX IF NOT EXISTS idx_mov_time ON inventory_movements(occurred_at);

CREATE TABLE IF NOT EXISTS stock_reservations (
  id            text PRIMARY KEY,           -- RES-000001
  sales_order_id text NOT NULL,
  sales_order_item_id text NOT NULL,
  inventory_id  text NOT NULL,
  product_id    text NOT NULL,
  lot_id        text,
  location_id   text NOT NULL,
  pallet_id     text,
  quantity      double precision NOT NULL,
  picked_qty    double precision NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|CONSUMED|RELEASED|CANCELLED
  created_at    text NOT NULL,
  released_at   text
);
CREATE INDEX IF NOT EXISTS idx_res_order ON stock_reservations(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_res_inv ON stock_reservations(inventory_id);

-- ---------------------------------------------------------------- ARMAZENAGEM
CREATE TABLE IF NOT EXISTS storage_orders (
  id            text PRIMARY KEY,           -- ARM-000001
  pallet_id     text NOT NULL,
  inbound_order_id text,
  suggested_location_id text,
  final_location_id     text,
  status        text NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|CANCELLED
  operator_id   text,
  created_at    text NOT NULL,
  started_at    text,
  completed_at  text,
  override_reason text
);
CREATE INDEX IF NOT EXISTS idx_so_status ON storage_orders(status);

-- ---------------------------------------------------------------- VENDAS
CREATE TABLE IF NOT EXISTS sales_orders (
  id            text PRIMARY KEY,           -- PED-000125
  customer_id   text NOT NULL,
  warehouse_id  text NOT NULL,
  status        text NOT NULL,              -- PENDING|PICKING|CHECKING|READY_TO_LOAD|LOADING|LOADED|SHIPPED|CANCELLED
  priority      text NOT NULL DEFAULT 'NORMAL', -- URGENTE | ALTA | NORMAL | BAIXA
  issued_at     text NOT NULL,
  due_at        text NOT NULL,
  released_at   text,
  shipped_at    text,
  ship_to_address text, ship_to_city text, ship_to_state text, ship_to_zip text,
  carrier       text,
  total_value   double precision NOT NULL DEFAULT 0,
  total_weight_kg double precision NOT NULL DEFAULT 0,
  total_volumes integer NOT NULL DEFAULT 0,
  reserved      integer NOT NULL DEFAULT 0,
  notes         text,
  created_at    text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_so_status2 ON sales_orders(status);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id            text PRIMARY KEY,
  sales_order_id text NOT NULL,
  line_no       integer NOT NULL,
  product_id    text NOT NULL,
  quantity      double precision NOT NULL,
  unit          text NOT NULL,
  unit_price    double precision NOT NULL,
  reserved_qty  double precision NOT NULL DEFAULT 0,
  picked_qty    double precision NOT NULL DEFAULT 0,
  packed_qty    double precision NOT NULL DEFAULT 0,
  shipped_qty   double precision NOT NULL DEFAULT 0,
  weight_kg     double precision NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_soi_order ON sales_order_items(sales_order_id);

-- ---------------------------------------------------------------- PICKING
CREATE TABLE IF NOT EXISTS picking_orders (
  id            text PRIMARY KEY,           -- PCK-000001
  sales_order_id text NOT NULL,
  status        text NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|DIVERGENCE|CANCELLED
  strategy      text NOT NULL DEFAULT 'FEFO', -- FEFO | FIFO
  priority      text NOT NULL DEFAULT 'NORMAL',
  operator_id   text,
  equipment_id  text,
  total_lines   integer NOT NULL DEFAULT 0,
  done_lines    integer NOT NULL DEFAULT 0,
  total_units   double precision NOT NULL DEFAULT 0,
  picked_units  double precision NOT NULL DEFAULT 0,
  created_at    text NOT NULL,
  started_at    text,
  completed_at  text
);

CREATE TABLE IF NOT EXISTS picking_items (
  id            text PRIMARY KEY,           -- PKI-000001
  picking_order_id text NOT NULL,
  sequence      integer NOT NULL,
  reservation_id text,
  sales_order_item_id text NOT NULL,
  product_id    text NOT NULL,
  lot_id        text,
  location_id   text NOT NULL,
  pallet_id     text,
  expected_qty  double precision NOT NULL,
  picked_qty    double precision NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'PENDING', -- PENDING|LOCATION_SCANNED|PRODUCT_SCANNED|COMPLETED|DIVERGENCE|SKIPPED
  location_scanned_at text,
  product_scanned_at  text,
  completed_at  text,
  started_at    text,
  operator_id   text,
  divergence_reason text
);
CREATE INDEX IF NOT EXISTS idx_pki_order ON picking_items(picking_order_id);

-- ---------------------------------------------------------------- PACKING
CREATE TABLE IF NOT EXISTS packing_orders (
  id            text PRIMARY KEY,           -- PAK-000001
  sales_order_id text NOT NULL,
  status        text NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|DIVERGENCE|CANCELLED
  operator_id   text,
  station       text,
  total_volumes integer NOT NULL DEFAULT 0,
  total_weight_kg double precision NOT NULL DEFAULT 0,
  created_at    text NOT NULL,
  started_at    text,
  completed_at  text
);

CREATE TABLE IF NOT EXISTS packing_items (
  id            text PRIMARY KEY,
  packing_order_id text NOT NULL,
  sales_order_item_id text NOT NULL,
  product_id    text NOT NULL,
  lot_id        text,
  expected_qty  double precision NOT NULL,
  packed_qty    double precision NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'PENDING'
);
CREATE INDEX IF NOT EXISTS idx_paki_order ON packing_items(packing_order_id);

-- ---------------------------------------------------------------- EXPEDICAO
CREATE TABLE IF NOT EXISTS shipping_checks (
  id            text PRIMARY KEY,           -- CEX-000001
  sales_order_id text NOT NULL,
  status        text NOT NULL,              -- IN_PROGRESS|OK|DIVERGENCE|CLOSED
  operator_id   text,
  started_at    text NOT NULL,
  finished_at   text,
  divergence_count integer NOT NULL DEFAULT 0,
  notes         text
);

CREATE TABLE IF NOT EXISTS shipping_check_items (
  id            text PRIMARY KEY,
  check_id      text NOT NULL,
  product_id    text NOT NULL,
  ordered_qty   double precision NOT NULL,
  picked_qty    double precision NOT NULL,
  packed_qty    double precision NOT NULL,
  checked_qty   double precision NOT NULL DEFAULT 0,
  divergence    double precision NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS shipping_manifests (
  id            text PRIMARY KEY,           -- ROM-000018
  warehouse_id  text NOT NULL,
  status        text NOT NULL,              -- DRAFT|READY|LOADING|LOADED|SHIPPED|CANCELLED
  route         text NOT NULL,
  carrier       text,
  vehicle_plate text, vehicle_kind text,
  driver_name   text, driver_doc text,
  dock_id       text,
  seal          text,
  total_orders  integer NOT NULL DEFAULT 0,
  total_volumes integer NOT NULL DEFAULT 0,
  total_weight_kg double precision NOT NULL DEFAULT 0,
  total_value   double precision NOT NULL DEFAULT 0,
  scheduled_at  text,
  departed_at   text,
  created_at    text NOT NULL,
  created_by    text
);

CREATE TABLE IF NOT EXISTS manifest_orders (
  id            text PRIMARY KEY,
  manifest_id   text NOT NULL,
  sales_order_id text NOT NULL,
  stop_sequence integer NOT NULL,
  volumes       integer NOT NULL DEFAULT 0,
  weight_kg     double precision NOT NULL DEFAULT 0,
  UNIQUE(manifest_id, sales_order_id)
);

CREATE TABLE IF NOT EXISTS shipments (
  id            text PRIMARY KEY,           -- EXP-000001
  sales_order_id text NOT NULL,
  manifest_id   text,
  status        text NOT NULL,              -- PENDING|READY_TO_LOAD|LOADING|LOADED|SHIPPED|CANCELLED
  volumes       integer NOT NULL DEFAULT 0,
  weight_kg     double precision NOT NULL DEFAULT 0,
  shipped_at    text,
  delivered_at  text,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS transport_documents (
  id            text PRIMARY KEY,           -- DTS-000001
  manifest_id   text NOT NULL,
  number        text NOT NULL,
  series        text NOT NULL DEFAULT '001',
  access_key    text NOT NULL,
  issued_at     text NOT NULL,
  sender_id     text NOT NULL,
  carrier_name  text NOT NULL,
  carrier_cnpj  text NOT NULL,
  vehicle_plate text, driver_name text, driver_doc text,
  origin_city   text, destination_city text,
  total_volumes integer NOT NULL DEFAULT 0,
  total_weight_kg double precision NOT NULL DEFAULT 0,
  total_value   double precision NOT NULL DEFAULT 0,
  freight_value double precision NOT NULL DEFAULT 0,
  simulated     integer NOT NULL DEFAULT 1,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS loading_operations (
  id            text PRIMARY KEY,           -- CAR-000001
  manifest_id   text NOT NULL,
  dock_id       text,
  status        text NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|DIVERGENCE|CANCELLED
  operator_id   text,
  equipment_id  text,
  expected_volumes integer NOT NULL DEFAULT 0,
  loaded_volumes   integer NOT NULL DEFAULT 0,
  seal          text,
  started_at    text, completed_at text,
  created_at    text NOT NULL,
  notes         text
);

CREATE TABLE IF NOT EXISTS loading_scans (
  id            text PRIMARY KEY,
  loading_id    text NOT NULL,
  volume_id     text NOT NULL,
  sales_order_id text NOT NULL,
  scanned_at    text NOT NULL,
  operator_id   text,
  UNIQUE(loading_id, volume_id)
);

-- ---------------------------------------------------------------- INVENTARIO
CREATE TABLE IF NOT EXISTS inventory_counts (
  id            text PRIMARY KEY,           -- INV-000001
  kind          text NOT NULL DEFAULT 'CYCLIC', -- CYCLIC | GENERAL | SPOT
  status        text NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|CANCELLED
  scope         text,                       -- zona / criterio
  operator_id   text,
  total_items   integer NOT NULL DEFAULT 0,
  counted_items integer NOT NULL DEFAULT 0,
  divergence_items integer NOT NULL DEFAULT 0,
  accuracy      double precision,
  created_at    text NOT NULL,
  started_at    text, completed_at text
);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id            text PRIMARY KEY,
  count_id      text NOT NULL,
  location_id   text NOT NULL,
  product_id    text,
  lot_id        text,
  system_qty    double precision NOT NULL DEFAULT 0,
  counted_qty   double precision,
  divergence    double precision NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'PENDING', -- PENDING|COUNTED|DIVERGENCE|ADJUSTED
  counted_at    text,
  operator_id   text,
  adjusted      integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ici_count ON inventory_count_items(count_id);

-- ---------------------------------------------------------------- SUPORTE
CREATE TABLE IF NOT EXISTS equipment (
  id            text PRIMARY KEY,           -- EQP-0001
  kind          text NOT NULL,              -- COLETORA | EMPILHADEIRA | PALETEIRA | IMPRESSORA | BALANCA
  model         text NOT NULL,
  serial        text,
  status        text NOT NULL,              -- AVAILABLE|IN_USE|MAINTENANCE|UNAVAILABLE
  assigned_to   text,
  monitored_minutes double precision NOT NULL DEFAULT 480,
  downtime_minutes  double precision NOT NULL DEFAULT 0,
  last_event_at text,
  created_at    text NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id            text PRIMARY KEY,           -- OCO-000001
  kind          text NOT NULL,
  severity      text NOT NULL DEFAULT 'MEDIA', -- BAIXA | MEDIA | ALTA | CRITICA
  status        text NOT NULL DEFAULT 'OPEN', -- OPEN|IN_ANALYSIS|RESOLVED|CANCELLED
  ref_kind      text, ref_id text,
  document_id   text,
  sales_order_id text,
  product_id    text,
  location_id   text,
  quantity      double precision,
  description   text NOT NULL,
  resolution    text,
  operator_id   text,
  owner         text,
  opened_at     text NOT NULL,
  resolved_at   text
);
CREATE INDEX IF NOT EXISTS idx_inc_status ON incidents(status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            text PRIMARY KEY,
  actor         text NOT NULL,              -- operador/usuario
  actor_kind    text NOT NULL DEFAULT 'OPERATOR',
  action        text NOT NULL,              -- CREATE|UPDATE|APPROVE|CANCEL|RECEIVE|CHECK|MOVE|PICK|PACK|LOAD|SHIP|RESET|COUNT
  entity        text NOT NULL,
  entity_id     text NOT NULL,
  before_value  text,
  after_value   text,
  origin        text NOT NULL DEFAULT 'WEB', -- WEB | RF | SYSTEM | SEED
  detail        text,
  occurred_at   text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(occurred_at);

-- ---------------------------------------------------------------- SIMULACAO
CREATE TABLE IF NOT EXISTS simulation_scenarios (
  id            text PRIMARY KEY,           -- SIM-001
  name          text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'READY', -- READY | RUNNING | FINISHED
  seeded_at     text NOT NULL,
  started_at    text,
  reset_count   integer NOT NULL DEFAULT 0,
  last_reset_at text
);

CREATE TABLE IF NOT EXISTS simulation_events (
  id            text PRIMARY KEY,
  scenario_id   text NOT NULL,
  stage         text NOT NULL,              -- RECEIVING | STORAGE | PICKING | ...
  label         text NOT NULL,
  ref_kind      text, ref_id text,
  operator_id   text,
  occurred_at   text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_simev_scenario ON simulation_events(scenario_id, occurred_at);

-- sequencias determinísticas de identificadores
CREATE TABLE IF NOT EXISTS id_sequences (
  prefix        text PRIMARY KEY,
  current       integer NOT NULL DEFAULT 0
);

-- registro de leituras da coletora (rastreabilidade RF)
CREATE TABLE IF NOT EXISTS scan_events (
  id            text PRIMARY KEY,
  raw_code      text NOT NULL,
  resolved_kind text,
  resolved_id   text,
  operation     text NOT NULL,
  context_ref   text,
  result        text NOT NULL,              -- OK | REJECTED
  message       text,
  operator_id   text,
  device_id     text,
  occurred_at   text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scan_time ON scan_events(occurred_at);

-- ---------------------------------------------------------------------
-- CHAVES ESTRANGEIRAS
-- Declaradas ao final porque o PostgreSQL, ao contrario do SQLite, exige
-- que a tabela referenciada ja exista no momento do CREATE TABLE. Sao as
-- MESMAS 105 chaves do esquema original, sem alteracao de semantica.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE operators ADD CONSTRAINT fk_operators_user_id FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE product_barcodes ADD CONSTRAINT fk_product_barcodes_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE lots ADD CONSTRAINT fk_lots_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE lots ADD CONSTRAINT fk_lots_supplier_id FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE zones ADD CONSTRAINT fk_zones_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE locations ADD CONSTRAINT fk_locations_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE locations ADD CONSTRAINT fk_locations_zone_id FOREIGN KEY (zone_id) REFERENCES zones(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE docks ADD CONSTRAINT fk_docks_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE pallets ADD CONSTRAINT fk_pallets_location_id FOREIGN KEY (location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE pallet_items ADD CONSTRAINT fk_pallet_items_pallet_id FOREIGN KEY (pallet_id) REFERENCES pallets(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE pallet_items ADD CONSTRAINT fk_pallet_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE pallet_items ADD CONSTRAINT fk_pallet_items_lot_id FOREIGN KEY (lot_id) REFERENCES lots(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE volumes ADD CONSTRAINT fk_volumes_sales_order_id FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE volumes ADD CONSTRAINT fk_volumes_packing_order_id FOREIGN KEY (packing_order_id) REFERENCES packing_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE volumes ADD CONSTRAINT fk_volumes_shipment_id FOREIGN KEY (shipment_id) REFERENCES shipments(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE volume_items ADD CONSTRAINT fk_volume_items_volume_id FOREIGN KEY (volume_id) REFERENCES volumes(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE volume_items ADD CONSTRAINT fk_volume_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE volume_items ADD CONSTRAINT fk_volume_items_lot_id FOREIGN KEY (lot_id) REFERENCES lots(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_supplier_id FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE purchase_order_items ADD CONSTRAINT fk_purchase_order_items_purchase_order_id FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE purchase_order_items ADD CONSTRAINT fk_purchase_order_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inbound_orders ADD CONSTRAINT fk_inbound_orders_purchase_order_id FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inbound_orders ADD CONSTRAINT fk_inbound_orders_supplier_id FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inbound_orders ADD CONSTRAINT fk_inbound_orders_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inbound_orders ADD CONSTRAINT fk_inbound_orders_dock_id FOREIGN KEY (dock_id) REFERENCES docks(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inbound_orders ADD CONSTRAINT fk_inbound_orders_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inbound_order_items ADD CONSTRAINT fk_inbound_order_items_inbound_order_id FOREIGN KEY (inbound_order_id) REFERENCES inbound_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inbound_order_items ADD CONSTRAINT fk_inbound_order_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT fk_invoices_inbound_order_id FOREIGN KEY (inbound_order_id) REFERENCES inbound_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE weighings ADD CONSTRAINT fk_weighings_equipment_id FOREIGN KEY (equipment_id) REFERENCES equipment(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE weighings ADD CONSTRAINT fk_weighings_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE receiving_checks ADD CONSTRAINT fk_receiving_checks_inbound_order_id FOREIGN KEY (inbound_order_id) REFERENCES inbound_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE receiving_checks ADD CONSTRAINT fk_receiving_checks_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE receiving_check_items ADD CONSTRAINT fk_receiving_check_items_check_id FOREIGN KEY (check_id) REFERENCES receiving_checks(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE receiving_check_items ADD CONSTRAINT fk_receiving_check_items_inbound_item_id FOREIGN KEY (inbound_item_id) REFERENCES inbound_order_items(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE receiving_check_items ADD CONSTRAINT fk_receiving_check_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE receiving_check_items ADD CONSTRAINT fk_receiving_check_items_pallet_id FOREIGN KEY (pallet_id) REFERENCES pallets(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory ADD CONSTRAINT fk_inventory_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory ADD CONSTRAINT fk_inventory_lot_id FOREIGN KEY (lot_id) REFERENCES lots(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory ADD CONSTRAINT fk_inventory_location_id FOREIGN KEY (location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory ADD CONSTRAINT fk_inventory_pallet_id FOREIGN KEY (pallet_id) REFERENCES pallets(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_lot_id FOREIGN KEY (lot_id) REFERENCES lots(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_from_location_id FOREIGN KEY (from_location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_to_location_id FOREIGN KEY (to_location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_pallet_id FOREIGN KEY (pallet_id) REFERENCES pallets(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE stock_reservations ADD CONSTRAINT fk_stock_reservations_sales_order_id FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE stock_reservations ADD CONSTRAINT fk_stock_reservations_inventory_id FOREIGN KEY (inventory_id) REFERENCES inventory(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE stock_reservations ADD CONSTRAINT fk_stock_reservations_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE stock_reservations ADD CONSTRAINT fk_stock_reservations_lot_id FOREIGN KEY (lot_id) REFERENCES lots(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE stock_reservations ADD CONSTRAINT fk_stock_reservations_location_id FOREIGN KEY (location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE stock_reservations ADD CONSTRAINT fk_stock_reservations_pallet_id FOREIGN KEY (pallet_id) REFERENCES pallets(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE storage_orders ADD CONSTRAINT fk_storage_orders_pallet_id FOREIGN KEY (pallet_id) REFERENCES pallets(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE storage_orders ADD CONSTRAINT fk_storage_orders_inbound_order_id FOREIGN KEY (inbound_order_id) REFERENCES inbound_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE storage_orders ADD CONSTRAINT fk_storage_orders_suggested_location_id FOREIGN KEY (suggested_location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE storage_orders ADD CONSTRAINT fk_storage_orders_final_location_id FOREIGN KEY (final_location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE storage_orders ADD CONSTRAINT fk_storage_orders_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sales_orders ADD CONSTRAINT fk_sales_orders_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sales_orders ADD CONSTRAINT fk_sales_orders_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sales_order_items ADD CONSTRAINT fk_sales_order_items_sales_order_id FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sales_order_items ADD CONSTRAINT fk_sales_order_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE picking_orders ADD CONSTRAINT fk_picking_orders_sales_order_id FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE picking_orders ADD CONSTRAINT fk_picking_orders_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE picking_orders ADD CONSTRAINT fk_picking_orders_equipment_id FOREIGN KEY (equipment_id) REFERENCES equipment(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE picking_items ADD CONSTRAINT fk_picking_items_picking_order_id FOREIGN KEY (picking_order_id) REFERENCES picking_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE picking_items ADD CONSTRAINT fk_picking_items_reservation_id FOREIGN KEY (reservation_id) REFERENCES stock_reservations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE picking_items ADD CONSTRAINT fk_picking_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE picking_items ADD CONSTRAINT fk_picking_items_lot_id FOREIGN KEY (lot_id) REFERENCES lots(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE picking_items ADD CONSTRAINT fk_picking_items_location_id FOREIGN KEY (location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE picking_items ADD CONSTRAINT fk_picking_items_pallet_id FOREIGN KEY (pallet_id) REFERENCES pallets(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE packing_orders ADD CONSTRAINT fk_packing_orders_sales_order_id FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE packing_orders ADD CONSTRAINT fk_packing_orders_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE packing_items ADD CONSTRAINT fk_packing_items_packing_order_id FOREIGN KEY (packing_order_id) REFERENCES packing_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE packing_items ADD CONSTRAINT fk_packing_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE packing_items ADD CONSTRAINT fk_packing_items_lot_id FOREIGN KEY (lot_id) REFERENCES lots(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE shipping_checks ADD CONSTRAINT fk_shipping_checks_sales_order_id FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE shipping_checks ADD CONSTRAINT fk_shipping_checks_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE shipping_check_items ADD CONSTRAINT fk_shipping_check_items_check_id FOREIGN KEY (check_id) REFERENCES shipping_checks(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE shipping_check_items ADD CONSTRAINT fk_shipping_check_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE shipping_manifests ADD CONSTRAINT fk_shipping_manifests_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE shipping_manifests ADD CONSTRAINT fk_shipping_manifests_dock_id FOREIGN KEY (dock_id) REFERENCES docks(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE manifest_orders ADD CONSTRAINT fk_manifest_orders_manifest_id FOREIGN KEY (manifest_id) REFERENCES shipping_manifests(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE manifest_orders ADD CONSTRAINT fk_manifest_orders_sales_order_id FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE shipments ADD CONSTRAINT fk_shipments_sales_order_id FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE shipments ADD CONSTRAINT fk_shipments_manifest_id FOREIGN KEY (manifest_id) REFERENCES shipping_manifests(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE transport_documents ADD CONSTRAINT fk_transport_documents_manifest_id FOREIGN KEY (manifest_id) REFERENCES shipping_manifests(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE loading_operations ADD CONSTRAINT fk_loading_operations_manifest_id FOREIGN KEY (manifest_id) REFERENCES shipping_manifests(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE loading_operations ADD CONSTRAINT fk_loading_operations_dock_id FOREIGN KEY (dock_id) REFERENCES docks(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE loading_operations ADD CONSTRAINT fk_loading_operations_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE loading_operations ADD CONSTRAINT fk_loading_operations_equipment_id FOREIGN KEY (equipment_id) REFERENCES equipment(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE loading_scans ADD CONSTRAINT fk_loading_scans_loading_id FOREIGN KEY (loading_id) REFERENCES loading_operations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE loading_scans ADD CONSTRAINT fk_loading_scans_volume_id FOREIGN KEY (volume_id) REFERENCES volumes(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_counts ADD CONSTRAINT fk_inventory_counts_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_count_items ADD CONSTRAINT fk_inventory_count_items_count_id FOREIGN KEY (count_id) REFERENCES inventory_counts(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_count_items ADD CONSTRAINT fk_inventory_count_items_location_id FOREIGN KEY (location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_count_items ADD CONSTRAINT fk_inventory_count_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inventory_count_items ADD CONSTRAINT fk_inventory_count_items_lot_id FOREIGN KEY (lot_id) REFERENCES lots(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE equipment ADD CONSTRAINT fk_equipment_assigned_to FOREIGN KEY (assigned_to) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE incidents ADD CONSTRAINT fk_incidents_product_id FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE incidents ADD CONSTRAINT fk_incidents_location_id FOREIGN KEY (location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE incidents ADD CONSTRAINT fk_incidents_operator_id FOREIGN KEY (operator_id) REFERENCES operators(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE simulation_events ADD CONSTRAINT fk_simulation_events_scenario_id FOREIGN KEY (scenario_id) REFERENCES simulation_scenarios(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- AUTENTICACAO
-- Colunas acrescentadas a `users` por ALTER: o bloco CREATE TABLE usa
-- IF NOT EXISTS e seria ignorado por inteiro num banco que ja tem a
-- tabela, entao colunas novas nunca chegariam por la.
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title text;   -- cargo: Gestor, Operadora...
ALTER TABLE users ADD COLUMN IF NOT EXISTS sector    text;   -- setor: Recebimento, Picking...

-- Sessoes: token opaco, verificado no servidor a cada requisicao.
-- Deliberadamente FORA do reset do cenario (ver TABLES em simulation.ts):
-- reiniciar a simulacao nao deve expulsar quem esta operando.
CREATE TABLE IF NOT EXISTS user_sessions (
  token         text PRIMARY KEY,           -- 32 bytes aleatorios, base64url
  user_id       text NOT NULL,
  created_at    text NOT NULL,
  expires_at    text NOT NULL,
  last_seen_at  text
);
CREATE INDEX IF NOT EXISTS idx_session_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_session_exp  ON user_sessions(expires_at);

-- ---------------------------------------------------------------------
-- PACOTE DE DOCUMENTOS DA DEMONSTRACAO
-- Os volumes passam a poder nascer ANTES da operacao, em estado PLANNED,
-- para que as etiquetas sejam impressas com antecedencia. O packing
-- reivindica o volume planejado em vez de cunhar um novo, de modo que a
-- caixa fisica e a linha do banco sejam a mesma coisa.
--   status: PLANNED|OPEN|CLOSED|CHECKED|LOADED|SHIPPED|CANCELLED
--
-- Volumes de ENTRADA (as 10 caixas recebidas) nao tinham onde se ancorar:
-- `volumes` so apontava para pedido de venda e ordem de embalagem.
-- ---------------------------------------------------------------------
ALTER TABLE volumes ADD COLUMN IF NOT EXISTS inbound_order_id text;
ALTER TABLE volumes ADD COLUMN IF NOT EXISTS planned          integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_volume_inbound ON volumes(inbound_order_id);
CREATE INDEX IF NOT EXISTS idx_volume_planned ON volumes(sales_order_id, status);

-- O palete de recebimento tambem nasce antes: a ordem de armazenagem e a
-- etiqueta de palete precisam existir para serem impressas. Enquanto
-- `planned = 1` o palete nao lancou nenhum movimento de estoque; o
-- recebimento real o reivindica e so entao lanca a entrada.
ALTER TABLE pallets ADD COLUMN IF NOT EXISTS planned integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pallet_planned ON pallets(origin_ref, status);

-- Registro do que o pacote pre-gerou. Nao guarda conteudo de documento
-- nenhum: guarda o PONTEIRO para a entidade real que o documento exibe.
-- E o que permite a rotina ser idempotente e o relatorio de validacao
-- apontar orfaos.
CREATE TABLE IF NOT EXISTS demo_document_pack (
  id            text PRIMARY KEY,          -- <doc_type>:<entity_id>
  scenario_id   text NOT NULL,
  doc_type      text NOT NULL,             -- volume-label | picklist | manifest ...
  entity        text NOT NULL,             -- tabela de origem
  entity_id     text NOT NULL,
  stage         text NOT NULL,             -- entrada | armazenagem | saida
  created_at    text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_pack_type ON demo_document_pack(doc_type);
