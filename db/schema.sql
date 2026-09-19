-- =====================================================================
-- JARVIS WMS — Esquema operacional
-- SQLite (node:sqlite). Tipos e datas em ISO-8601 UTC (TEXT).
-- Chaves primarias sao os MESMOS identificadores impressos em codigo de
-- barras (ex.: PLT-000001, END-A020301, PED-000125), conforme exigido
-- pela operacao fisica.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- PESSOAS
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL,              -- ADMIN | SUPERVISOR | OPERATOR | VIEWER
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operators (
  id            TEXT PRIMARY KEY,           -- OPR-0001
  user_id       TEXT REFERENCES users(id),
  name          TEXT NOT NULL,
  badge         TEXT NOT NULL UNIQUE,       -- codigo de barras do cracha
  shift         TEXT NOT NULL,              -- MANHA | TARDE | NOITE
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id            TEXT PRIMARY KEY,           -- FOR-0001
  name          TEXT NOT NULL,
  trade_name    TEXT,
  cnpj          TEXT NOT NULL,              -- ficticio (simulacao)
  ie            TEXT,
  address       TEXT, city TEXT, state TEXT, zip TEXT,
  phone         TEXT, email TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,           -- CLI-0001
  name          TEXT NOT NULL,
  trade_name    TEXT,
  cnpj          TEXT NOT NULL,
  ie            TEXT,
  address       TEXT, city TEXT, state TEXT, zip TEXT,
  phone         TEXT, email TEXT,
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------- PRODUTO
CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,           -- SKU-001
  sku           TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL,
  unit          TEXT NOT NULL,              -- CX | UN | PC
  ncm           TEXT,
  cfop_in       TEXT, cfop_out TEXT,
  unit_weight_kg   REAL NOT NULL DEFAULT 0, -- peso liquido por unidade
  unit_gross_kg    REAL NOT NULL DEFAULT 0,
  length_cm     REAL DEFAULT 0, width_cm REAL DEFAULT 0, height_cm REAL DEFAULT 0,
  units_per_pallet INTEGER NOT NULL DEFAULT 40,
  unit_price    REAL NOT NULL DEFAULT 0,
  lot_controlled   INTEGER NOT NULL DEFAULT 1,
  shelf_life_days  INTEGER,
  min_stock     INTEGER NOT NULL DEFAULT 0,
  abc_class     TEXT NOT NULL DEFAULT 'B',  -- A | B | C (define zona preferencial)
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  code          TEXT NOT NULL UNIQUE,       -- valor lido pela coletora
  symbology     TEXT NOT NULL DEFAULT 'CODE128',
  kind          TEXT NOT NULL DEFAULT 'INTERNAL', -- INTERNAL | EAN13 | DUN14
  is_primary    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pb_product ON product_barcodes(product_id);

CREATE TABLE IF NOT EXISTS lots (
  id            TEXT PRIMARY KEY,           -- LOT-000001
  product_id    TEXT NOT NULL REFERENCES products(id),
  code          TEXT NOT NULL,              -- L2409A
  manufactured_at TEXT,
  expires_at    TEXT,
  supplier_id   TEXT REFERENCES suppliers(id),
  created_at    TEXT NOT NULL,
  UNIQUE(product_id, code)
);

-- ---------------------------------------------------------------- ARMAZEM
CREATE TABLE IF NOT EXISTS warehouses (
  id            TEXT PRIMARY KEY,           -- CD-01
  name          TEXT NOT NULL,
  address       TEXT, city TEXT, state TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zones (
  id            TEXT PRIMARY KEY,           -- A
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,              -- PICKING | STORAGE | RECEIVING | SHIPPING | QUARANTINE
  temperature   TEXT NOT NULL DEFAULT 'AMBIENTE',
  abc_class     TEXT DEFAULT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS locations (
  id            TEXT PRIMARY KEY,           -- END-A020301
  code          TEXT NOT NULL UNIQUE,       -- A-02-03-01
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  zone_id       TEXT NOT NULL REFERENCES zones(id),
  aisle         TEXT NOT NULL,              -- corredor 02
  rack          TEXT NOT NULL,              -- modulo 03
  level         TEXT NOT NULL,              -- nivel 01
  position      TEXT NOT NULL DEFAULT '01', -- posicao
  kind          TEXT NOT NULL DEFAULT 'PALLET', -- PALLET | SHELF | FLOOR | DOCK | STAGING
  status        TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE|OCCUPIED|RESERVED|BLOCKED|MOVING
  capacity_pallets INTEGER NOT NULL DEFAULT 1,
  capacity_units   INTEGER NOT NULL DEFAULT 0,
  max_weight_kg REAL NOT NULL DEFAULT 1000,
  pick_sequence INTEGER NOT NULL DEFAULT 0, -- ordem de rota de picking
  blocked_reason TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loc_zone ON locations(zone_id);
CREATE INDEX IF NOT EXISTS idx_loc_status ON locations(status);

CREATE TABLE IF NOT EXISTS docks (
  id            TEXT PRIMARY KEY,           -- DOCA-01
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,              -- INBOUND | OUTBOUND | BOTH
  status        TEXT NOT NULL DEFAULT 'FREE', -- FREE | OCCUPIED | BLOCKED
  current_ref   TEXT
);

-- ---------------------------------------------------------------- UNITIZACAO
CREATE TABLE IF NOT EXISTS pallets (
  id            TEXT PRIMARY KEY,           -- PLT-000001
  kind          TEXT NOT NULL DEFAULT 'PBR', -- PBR | CHEP | DESCARTAVEL
  status        TEXT NOT NULL,              -- BUILDING|AWAITING_PUTAWAY|STORED|PICKING|CONSUMED|SHIPPED|BLOCKED
  location_id   TEXT REFERENCES locations(id),
  origin_kind   TEXT NOT NULL,              -- RECEIVING | INITIAL_STOCK | REPACK
  origin_ref    TEXT,                       -- OR-..., SIM-001
  tare_kg       REAL NOT NULL DEFAULT 25,
  gross_weight_kg REAL NOT NULL DEFAULT 0,
  net_weight_kg REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  stored_at     TEXT,
  created_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_pallet_loc ON pallets(location_id);

CREATE TABLE IF NOT EXISTS pallet_items (
  id            TEXT PRIMARY KEY,
  pallet_id     TEXT NOT NULL REFERENCES pallets(id),
  product_id    TEXT NOT NULL REFERENCES products(id),
  lot_id        TEXT REFERENCES lots(id),
  quantity      REAL NOT NULL,
  UNIQUE(pallet_id, product_id, lot_id)
);

CREATE TABLE IF NOT EXISTS volumes (
  id            TEXT PRIMARY KEY,           -- VOL-000001
  sales_order_id TEXT REFERENCES sales_orders(id),
  packing_order_id TEXT REFERENCES packing_orders(id),
  shipment_id   TEXT REFERENCES shipments(id),
  sequence      INTEGER NOT NULL DEFAULT 1,
  container_kind TEXT NOT NULL DEFAULT 'CAIXA', -- CAIXA | PALETE | ENVELOPE
  length_cm     REAL NOT NULL DEFAULT 40,
  width_cm      REAL NOT NULL DEFAULT 30,
  height_cm     REAL NOT NULL DEFAULT 30,
  tare_kg       REAL NOT NULL DEFAULT 0.4,
  net_weight_kg REAL NOT NULL DEFAULT 0,
  gross_weight_kg REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|CLOSED|CHECKED|LOADED|SHIPPED|CANCELLED
  checked_at    TEXT, loaded_at TEXT,
  created_at    TEXT NOT NULL,
  created_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_vol_order ON volumes(sales_order_id);

CREATE TABLE IF NOT EXISTS volume_items (
  id            TEXT PRIMARY KEY,
  volume_id     TEXT NOT NULL REFERENCES volumes(id),
  product_id    TEXT NOT NULL REFERENCES products(id),
  lot_id        TEXT REFERENCES lots(id),
  quantity      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_volitem_vol ON volume_items(volume_id);

-- ---------------------------------------------------------------- COMPRAS
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            TEXT PRIMARY KEY,           -- PC-000001
  supplier_id   TEXT NOT NULL REFERENCES suppliers(id),
  issued_at     TEXT NOT NULL,
  expected_at   TEXT NOT NULL,
  status        TEXT NOT NULL,              -- DRAFT|SENT|CONFIRMED|PARTIALLY_RECEIVED|RECEIVED|CANCELLED
  buyer         TEXT,
  payment_terms TEXT,
  total_value   REAL NOT NULL DEFAULT 0,
  total_weight_kg REAL NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id            TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  line_no       INTEGER NOT NULL,
  product_id    TEXT NOT NULL REFERENCES products(id),
  quantity      REAL NOT NULL,
  unit          TEXT NOT NULL,
  unit_price    REAL NOT NULL,
  lot_code      TEXT,
  expires_at    TEXT,
  weight_kg     REAL NOT NULL DEFAULT 0,
  received_qty  REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(purchase_order_id);

-- ---------------------------------------------------------------- RECEBIMENTO
CREATE TABLE IF NOT EXISTS inbound_orders (
  id            TEXT PRIMARY KEY,           -- OR-000001
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  supplier_id   TEXT NOT NULL REFERENCES suppliers(id),
  invoice_id    TEXT,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  dock_id       TEXT REFERENCES docks(id),
  status        TEXT NOT NULL,              -- SCHEDULED|ARRIVING|RECEIVING|CHECKING|DIVERGENCE|APPROVED|COMPLETED|CANCELLED
  scheduled_at  TEXT NOT NULL,
  arrived_at    TEXT, started_at TEXT, checked_at TEXT, completed_at TEXT,
  vehicle_plate TEXT, vehicle_kind TEXT,
  driver_name   TEXT, driver_doc TEXT,
  carrier       TEXT,
  expected_volumes  INTEGER NOT NULL DEFAULT 0,
  expected_weight_kg REAL NOT NULL DEFAULT 0,
  received_volumes  INTEGER NOT NULL DEFAULT 0,
  operator_id   TEXT REFERENCES operators(id),
  notes         TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_order_items (
  id            TEXT PRIMARY KEY,
  inbound_order_id TEXT NOT NULL REFERENCES inbound_orders(id),
  line_no       INTEGER NOT NULL,
  product_id    TEXT NOT NULL REFERENCES products(id),
  lot_code      TEXT,
  expires_at    TEXT,
  expected_qty  REAL NOT NULL,
  checked_qty   REAL NOT NULL DEFAULT 0,
  accepted_qty  REAL NOT NULL DEFAULT 0,
  rejected_qty  REAL NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING' -- PENDING|CHECKING|OK|DIVERGENCE
);
CREATE INDEX IF NOT EXISTS idx_ioi_order ON inbound_order_items(inbound_order_id);

-- Nota fiscal SIMULADA (uso academico)
CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,           -- NFS-000001
  number        TEXT NOT NULL,
  series        TEXT NOT NULL DEFAULT '001',
  access_key    TEXT NOT NULL,              -- chave simulada 44 digitos
  issued_at     TEXT NOT NULL,
  kind          TEXT NOT NULL,              -- INBOUND | OUTBOUND
  issuer_kind   TEXT NOT NULL,              -- SUPPLIER | WAREHOUSE
  issuer_id     TEXT NOT NULL,
  recipient_kind TEXT NOT NULL,
  recipient_id  TEXT NOT NULL,
  nature_op     TEXT NOT NULL,
  total_products REAL NOT NULL DEFAULT 0,
  total_invoice REAL NOT NULL DEFAULT 0,
  total_weight_kg REAL NOT NULL DEFAULT 0,
  total_volumes INTEGER NOT NULL DEFAULT 0,
  inbound_order_id TEXT REFERENCES inbound_orders(id),
  sales_order_id TEXT,
  simulated     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id            TEXT PRIMARY KEY,
  invoice_id    TEXT NOT NULL REFERENCES invoices(id),
  line_no       INTEGER NOT NULL,
  product_id    TEXT NOT NULL REFERENCES products(id),
  description   TEXT NOT NULL,
  ncm           TEXT, cfop TEXT,
  unit          TEXT NOT NULL,
  quantity      REAL NOT NULL,
  unit_price    REAL NOT NULL,
  total_price   REAL NOT NULL,
  weight_kg     REAL NOT NULL DEFAULT 0,
  lot_code      TEXT, expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invit_inv ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS weighings (
  id            TEXT PRIMARY KEY,           -- PES-000001
  ref_kind      TEXT NOT NULL,              -- INBOUND_ORDER | PALLET | VOLUME | SHIPMENT
  ref_id        TEXT NOT NULL,
  gross_kg      REAL NOT NULL,
  tare_kg       REAL NOT NULL,
  net_kg        REAL NOT NULL,
  expected_kg   REAL,
  divergence_kg REAL NOT NULL DEFAULT 0,
  equipment_id  TEXT REFERENCES equipment(id),
  operator_id   TEXT REFERENCES operators(id),
  weighed_at    TEXT NOT NULL,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_weigh_ref ON weighings(ref_kind, ref_id);

CREATE TABLE IF NOT EXISTS receiving_checks (
  id            TEXT PRIMARY KEY,           -- CONF-000001
  inbound_order_id TEXT NOT NULL REFERENCES inbound_orders(id),
  operator_id   TEXT REFERENCES operators(id),
  status        TEXT NOT NULL,              -- IN_PROGRESS | OK | DIVERGENCE | CLOSED
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  total_expected REAL NOT NULL DEFAULT 0,
  total_checked REAL NOT NULL DEFAULT 0,
  divergence_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS receiving_check_items (
  id            TEXT PRIMARY KEY,
  check_id      TEXT NOT NULL REFERENCES receiving_checks(id),
  inbound_item_id TEXT NOT NULL REFERENCES inbound_order_items(id),
  product_id    TEXT NOT NULL REFERENCES products(id),
  lot_code      TEXT, expires_at TEXT,
  expected_qty  REAL NOT NULL,
  checked_qty   REAL NOT NULL DEFAULT 0,
  divergence    REAL NOT NULL DEFAULT 0,
  pallet_id     TEXT REFERENCES pallets(id),
  status        TEXT NOT NULL DEFAULT 'PENDING',
  checked_at    TEXT,
  operator_id   TEXT
);
CREATE INDEX IF NOT EXISTS idx_rci_check ON receiving_check_items(check_id);

-- ---------------------------------------------------------------- ESTOQUE
CREATE TABLE IF NOT EXISTS inventory (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  lot_id        TEXT REFERENCES lots(id),
  location_id   TEXT NOT NULL REFERENCES locations(id),
  pallet_id     TEXT REFERENCES pallets(id),
  qty_on_hand   REAL NOT NULL DEFAULT 0,
  qty_reserved  REAL NOT NULL DEFAULT 0,
  qty_blocked   REAL NOT NULL DEFAULT 0,
  qty_in_transit REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE|RESERVED|BLOCKED|IN_TRANSIT
  weight_kg     REAL NOT NULL DEFAULT 0,
  received_at   TEXT,
  updated_at    TEXT NOT NULL,
  UNIQUE(product_id, lot_id, location_id, pallet_id)
);
CREATE INDEX IF NOT EXISTS idx_inv_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_loc ON inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_pallet ON inventory(pallet_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            TEXT PRIMARY KEY,           -- MOV-000001
  kind          TEXT NOT NULL,              -- RECEIPT|PUTAWAY|TRANSFER|PICK|PACK|SHIP|ADJUSTMENT|COUNT|BLOCK|UNBLOCK|RETURN
  product_id    TEXT NOT NULL REFERENCES products(id),
  lot_id        TEXT REFERENCES lots(id),
  quantity      REAL NOT NULL,              -- sempre positiva; direcao dada por from/to
  unit          TEXT NOT NULL DEFAULT 'CX',
  from_location_id TEXT REFERENCES locations(id),
  to_location_id   TEXT REFERENCES locations(id),
  pallet_id     TEXT REFERENCES pallets(id),
  ref_kind      TEXT,                       -- INBOUND_ORDER|SALES_ORDER|PICKING|PACKING|SHIPMENT|COUNT|MANUAL
  ref_id        TEXT,
  reason        TEXT,
  operator_id   TEXT REFERENCES operators(id),
  balance_after REAL,                       -- saldo do produto apos o movimento
  weight_kg     REAL NOT NULL DEFAULT 0,
  occurred_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mov_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_mov_ref ON inventory_movements(ref_kind, ref_id);
CREATE INDEX IF NOT EXISTS idx_mov_time ON inventory_movements(occurred_at);

CREATE TABLE IF NOT EXISTS stock_reservations (
  id            TEXT PRIMARY KEY,           -- RES-000001
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
  sales_order_item_id TEXT NOT NULL,
  inventory_id  TEXT NOT NULL REFERENCES inventory(id),
  product_id    TEXT NOT NULL REFERENCES products(id),
  lot_id        TEXT REFERENCES lots(id),
  location_id   TEXT NOT NULL REFERENCES locations(id),
  pallet_id     TEXT REFERENCES pallets(id),
  quantity      REAL NOT NULL,
  picked_qty    REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|CONSUMED|RELEASED|CANCELLED
  created_at    TEXT NOT NULL,
  released_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_res_order ON stock_reservations(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_res_inv ON stock_reservations(inventory_id);

-- ---------------------------------------------------------------- ARMAZENAGEM
CREATE TABLE IF NOT EXISTS storage_orders (
  id            TEXT PRIMARY KEY,           -- ARM-000001
  pallet_id     TEXT NOT NULL REFERENCES pallets(id),
  inbound_order_id TEXT REFERENCES inbound_orders(id),
  suggested_location_id TEXT REFERENCES locations(id),
  final_location_id     TEXT REFERENCES locations(id),
  status        TEXT NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|CANCELLED
  operator_id   TEXT REFERENCES operators(id),
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  completed_at  TEXT,
  override_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_so_status ON storage_orders(status);

-- ---------------------------------------------------------------- VENDAS
CREATE TABLE IF NOT EXISTS sales_orders (
  id            TEXT PRIMARY KEY,           -- PED-000125
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  status        TEXT NOT NULL,              -- PENDING|PICKING|CHECKING|READY_TO_LOAD|LOADING|LOADED|SHIPPED|CANCELLED
  priority      TEXT NOT NULL DEFAULT 'NORMAL', -- URGENTE | ALTA | NORMAL | BAIXA
  issued_at     TEXT NOT NULL,
  due_at        TEXT NOT NULL,
  released_at   TEXT,
  shipped_at    TEXT,
  ship_to_address TEXT, ship_to_city TEXT, ship_to_state TEXT, ship_to_zip TEXT,
  carrier       TEXT,
  total_value   REAL NOT NULL DEFAULT 0,
  total_weight_kg REAL NOT NULL DEFAULT 0,
  total_volumes INTEGER NOT NULL DEFAULT 0,
  reserved      INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_so_status2 ON sales_orders(status);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id            TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
  line_no       INTEGER NOT NULL,
  product_id    TEXT NOT NULL REFERENCES products(id),
  quantity      REAL NOT NULL,
  unit          TEXT NOT NULL,
  unit_price    REAL NOT NULL,
  reserved_qty  REAL NOT NULL DEFAULT 0,
  picked_qty    REAL NOT NULL DEFAULT 0,
  packed_qty    REAL NOT NULL DEFAULT 0,
  shipped_qty   REAL NOT NULL DEFAULT 0,
  weight_kg     REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_soi_order ON sales_order_items(sales_order_id);

-- ---------------------------------------------------------------- PICKING
CREATE TABLE IF NOT EXISTS picking_orders (
  id            TEXT PRIMARY KEY,           -- PCK-000001
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
  status        TEXT NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|DIVERGENCE|CANCELLED
  strategy      TEXT NOT NULL DEFAULT 'FEFO', -- FEFO | FIFO
  priority      TEXT NOT NULL DEFAULT 'NORMAL',
  operator_id   TEXT REFERENCES operators(id),
  equipment_id  TEXT REFERENCES equipment(id),
  total_lines   INTEGER NOT NULL DEFAULT 0,
  done_lines    INTEGER NOT NULL DEFAULT 0,
  total_units   REAL NOT NULL DEFAULT 0,
  picked_units  REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS picking_items (
  id            TEXT PRIMARY KEY,           -- PKI-000001
  picking_order_id TEXT NOT NULL REFERENCES picking_orders(id),
  sequence      INTEGER NOT NULL,
  reservation_id TEXT REFERENCES stock_reservations(id),
  sales_order_item_id TEXT NOT NULL,
  product_id    TEXT NOT NULL REFERENCES products(id),
  lot_id        TEXT REFERENCES lots(id),
  location_id   TEXT NOT NULL REFERENCES locations(id),
  pallet_id     TEXT REFERENCES pallets(id),
  expected_qty  REAL NOT NULL,
  picked_qty    REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|LOCATION_SCANNED|PRODUCT_SCANNED|COMPLETED|DIVERGENCE|SKIPPED
  location_scanned_at TEXT,
  product_scanned_at  TEXT,
  completed_at  TEXT,
  started_at    TEXT,
  operator_id   TEXT,
  divergence_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_pki_order ON picking_items(picking_order_id);

-- ---------------------------------------------------------------- PACKING
CREATE TABLE IF NOT EXISTS packing_orders (
  id            TEXT PRIMARY KEY,           -- PAK-000001
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
  status        TEXT NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|DIVERGENCE|CANCELLED
  operator_id   TEXT REFERENCES operators(id),
  station       TEXT,
  total_volumes INTEGER NOT NULL DEFAULT 0,
  total_weight_kg REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS packing_items (
  id            TEXT PRIMARY KEY,
  packing_order_id TEXT NOT NULL REFERENCES packing_orders(id),
  sales_order_item_id TEXT NOT NULL,
  product_id    TEXT NOT NULL REFERENCES products(id),
  lot_id        TEXT REFERENCES lots(id),
  expected_qty  REAL NOT NULL,
  packed_qty    REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE INDEX IF NOT EXISTS idx_paki_order ON packing_items(packing_order_id);

-- ---------------------------------------------------------------- EXPEDICAO
CREATE TABLE IF NOT EXISTS shipping_checks (
  id            TEXT PRIMARY KEY,           -- CEX-000001
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
  status        TEXT NOT NULL,              -- IN_PROGRESS|OK|DIVERGENCE|CLOSED
  operator_id   TEXT REFERENCES operators(id),
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  divergence_count INTEGER NOT NULL DEFAULT 0,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS shipping_check_items (
  id            TEXT PRIMARY KEY,
  check_id      TEXT NOT NULL REFERENCES shipping_checks(id),
  product_id    TEXT NOT NULL REFERENCES products(id),
  ordered_qty   REAL NOT NULL,
  picked_qty    REAL NOT NULL,
  packed_qty    REAL NOT NULL,
  checked_qty   REAL NOT NULL DEFAULT 0,
  divergence    REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS shipping_manifests (
  id            TEXT PRIMARY KEY,           -- ROM-000018
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  status        TEXT NOT NULL,              -- DRAFT|READY|LOADING|LOADED|SHIPPED|CANCELLED
  route         TEXT NOT NULL,
  carrier       TEXT,
  vehicle_plate TEXT, vehicle_kind TEXT,
  driver_name   TEXT, driver_doc TEXT,
  dock_id       TEXT REFERENCES docks(id),
  seal          TEXT,
  total_orders  INTEGER NOT NULL DEFAULT 0,
  total_volumes INTEGER NOT NULL DEFAULT 0,
  total_weight_kg REAL NOT NULL DEFAULT 0,
  total_value   REAL NOT NULL DEFAULT 0,
  scheduled_at  TEXT,
  departed_at   TEXT,
  created_at    TEXT NOT NULL,
  created_by    TEXT
);

CREATE TABLE IF NOT EXISTS manifest_orders (
  id            TEXT PRIMARY KEY,
  manifest_id   TEXT NOT NULL REFERENCES shipping_manifests(id),
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
  stop_sequence INTEGER NOT NULL,
  volumes       INTEGER NOT NULL DEFAULT 0,
  weight_kg     REAL NOT NULL DEFAULT 0,
  UNIQUE(manifest_id, sales_order_id)
);

CREATE TABLE IF NOT EXISTS shipments (
  id            TEXT PRIMARY KEY,           -- EXP-000001
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
  manifest_id   TEXT REFERENCES shipping_manifests(id),
  status        TEXT NOT NULL,              -- PENDING|READY_TO_LOAD|LOADING|LOADED|SHIPPED|CANCELLED
  volumes       INTEGER NOT NULL DEFAULT 0,
  weight_kg     REAL NOT NULL DEFAULT 0,
  shipped_at    TEXT,
  delivered_at  TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transport_documents (
  id            TEXT PRIMARY KEY,           -- DTS-000001
  manifest_id   TEXT NOT NULL REFERENCES shipping_manifests(id),
  number        TEXT NOT NULL,
  series        TEXT NOT NULL DEFAULT '001',
  access_key    TEXT NOT NULL,
  issued_at     TEXT NOT NULL,
  sender_id     TEXT NOT NULL,
  carrier_name  TEXT NOT NULL,
  carrier_cnpj  TEXT NOT NULL,
  vehicle_plate TEXT, driver_name TEXT, driver_doc TEXT,
  origin_city   TEXT, destination_city TEXT,
  total_volumes INTEGER NOT NULL DEFAULT 0,
  total_weight_kg REAL NOT NULL DEFAULT 0,
  total_value   REAL NOT NULL DEFAULT 0,
  freight_value REAL NOT NULL DEFAULT 0,
  simulated     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loading_operations (
  id            TEXT PRIMARY KEY,           -- CAR-000001
  manifest_id   TEXT NOT NULL REFERENCES shipping_manifests(id),
  dock_id       TEXT REFERENCES docks(id),
  status        TEXT NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|DIVERGENCE|CANCELLED
  operator_id   TEXT REFERENCES operators(id),
  equipment_id  TEXT REFERENCES equipment(id),
  expected_volumes INTEGER NOT NULL DEFAULT 0,
  loaded_volumes   INTEGER NOT NULL DEFAULT 0,
  seal          TEXT,
  started_at    TEXT, completed_at TEXT,
  created_at    TEXT NOT NULL,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS loading_scans (
  id            TEXT PRIMARY KEY,
  loading_id    TEXT NOT NULL REFERENCES loading_operations(id),
  volume_id     TEXT NOT NULL REFERENCES volumes(id),
  sales_order_id TEXT NOT NULL,
  scanned_at    TEXT NOT NULL,
  operator_id   TEXT,
  UNIQUE(loading_id, volume_id)
);

-- ---------------------------------------------------------------- INVENTARIO
CREATE TABLE IF NOT EXISTS inventory_counts (
  id            TEXT PRIMARY KEY,           -- INV-000001
  kind          TEXT NOT NULL DEFAULT 'CYCLIC', -- CYCLIC | GENERAL | SPOT
  status        TEXT NOT NULL,              -- PENDING|IN_PROGRESS|COMPLETED|CANCELLED
  scope         TEXT,                       -- zona / criterio
  operator_id   TEXT REFERENCES operators(id),
  total_items   INTEGER NOT NULL DEFAULT 0,
  counted_items INTEGER NOT NULL DEFAULT 0,
  divergence_items INTEGER NOT NULL DEFAULT 0,
  accuracy      REAL,
  created_at    TEXT NOT NULL,
  started_at    TEXT, completed_at TEXT
);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id            TEXT PRIMARY KEY,
  count_id      TEXT NOT NULL REFERENCES inventory_counts(id),
  location_id   TEXT NOT NULL REFERENCES locations(id),
  product_id    TEXT REFERENCES products(id),
  lot_id        TEXT REFERENCES lots(id),
  system_qty    REAL NOT NULL DEFAULT 0,
  counted_qty   REAL,
  divergence    REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|COUNTED|DIVERGENCE|ADJUSTED
  counted_at    TEXT,
  operator_id   TEXT,
  adjusted      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ici_count ON inventory_count_items(count_id);

-- ---------------------------------------------------------------- SUPORTE
CREATE TABLE IF NOT EXISTS equipment (
  id            TEXT PRIMARY KEY,           -- EQP-0001
  kind          TEXT NOT NULL,              -- COLETORA | EMPILHADEIRA | PALETEIRA | IMPRESSORA | BALANCA
  model         TEXT NOT NULL,
  serial        TEXT,
  status        TEXT NOT NULL,              -- AVAILABLE|IN_USE|MAINTENANCE|UNAVAILABLE
  assigned_to   TEXT REFERENCES operators(id),
  monitored_minutes REAL NOT NULL DEFAULT 480,
  downtime_minutes  REAL NOT NULL DEFAULT 0,
  last_event_at TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id            TEXT PRIMARY KEY,           -- OCO-000001
  kind          TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'MEDIA', -- BAIXA | MEDIA | ALTA | CRITICA
  status        TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|IN_ANALYSIS|RESOLVED|CANCELLED
  ref_kind      TEXT, ref_id TEXT,
  document_id   TEXT,
  sales_order_id TEXT,
  product_id    TEXT REFERENCES products(id),
  location_id   TEXT REFERENCES locations(id),
  quantity      REAL,
  description   TEXT NOT NULL,
  resolution    TEXT,
  operator_id   TEXT REFERENCES operators(id),
  owner         TEXT,
  opened_at     TEXT NOT NULL,
  resolved_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_inc_status ON incidents(status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT PRIMARY KEY,
  actor         TEXT NOT NULL,              -- operador/usuario
  actor_kind    TEXT NOT NULL DEFAULT 'OPERATOR',
  action        TEXT NOT NULL,              -- CREATE|UPDATE|APPROVE|CANCEL|RECEIVE|CHECK|MOVE|PICK|PACK|LOAD|SHIP|RESET|COUNT
  entity        TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  before_value  TEXT,
  after_value   TEXT,
  origin        TEXT NOT NULL DEFAULT 'WEB', -- WEB | RF | SYSTEM | SEED
  detail        TEXT,
  occurred_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(occurred_at);

-- ---------------------------------------------------------------- SIMULACAO
CREATE TABLE IF NOT EXISTS simulation_scenarios (
  id            TEXT PRIMARY KEY,           -- SIM-001
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'READY', -- READY | RUNNING | FINISHED
  seeded_at     TEXT NOT NULL,
  started_at    TEXT,
  reset_count   INTEGER NOT NULL DEFAULT 0,
  last_reset_at TEXT
);

CREATE TABLE IF NOT EXISTS simulation_events (
  id            TEXT PRIMARY KEY,
  scenario_id   TEXT NOT NULL REFERENCES simulation_scenarios(id),
  stage         TEXT NOT NULL,              -- RECEIVING | STORAGE | PICKING | ...
  label         TEXT NOT NULL,
  ref_kind      TEXT, ref_id TEXT,
  operator_id   TEXT,
  occurred_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_simev_scenario ON simulation_events(scenario_id, occurred_at);

-- sequencias determinísticas de identificadores
CREATE TABLE IF NOT EXISTS id_sequences (
  prefix        TEXT PRIMARY KEY,
  current       INTEGER NOT NULL DEFAULT 0
);

-- registro de leituras da coletora (rastreabilidade RF)
CREATE TABLE IF NOT EXISTS scan_events (
  id            TEXT PRIMARY KEY,
  raw_code      TEXT NOT NULL,
  resolved_kind TEXT,
  resolved_id   TEXT,
  operation     TEXT NOT NULL,
  context_ref   TEXT,
  result        TEXT NOT NULL,              -- OK | REJECTED
  message       TEXT,
  operator_id   TEXT,
  device_id     TEXT,
  occurred_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scan_time ON scan_events(occurred_at);
