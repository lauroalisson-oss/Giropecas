-- Tabelas de dados: todas escopadas por company_id.

create table public.access_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  duration_days numeric not null,
  plan_type text default 'non_fiscal',
  fiscal_note_limit numeric default 100,
  status text default 'available',
  client_name text,
  client_email text,
  activated_by text,
  activated_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.access_keys add constraint access_keys_plan_type_chk check (plan_type is null or plan_type in ('non_fiscal', 'fiscal'));
alter table public.access_keys add constraint access_keys_status_chk check (status is null or status in ('available', 'active', 'expired', 'revoked'));

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text default 'fisica',
  tax_id text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  credit_limit numeric default 0,
  credit_balance numeric default 0,
  notes text,
  is_active boolean default true,
  lgpd_consent boolean default false,
  lgpd_consent_date date,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.customers add constraint customers_type_chk check (type is null or type in ('fisica', 'juridica'));

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id text not null,
  brand text,
  model text not null,
  year numeric,
  plate text,
  chassis text,
  color text,
  current_km numeric,
  engine text,
  notes text,
  is_active boolean default true,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sku text,
  internal_code text,
  barcode text,
  lot text,
  ncm text,
  cfop_default text,
  description text not null,
  unit text default 'un',
  cost_price numeric default 0,
  sale_price numeric default 0,
  margin_percent numeric default 0,
  stock_quantity numeric default 0,
  min_stock numeric default 1,
  location text,
  supplier_id text,
  lead_time_days numeric default 1,
  is_active boolean default true,
  brand text,
  notes text,
  cest text,
  origin text default '0',
  cbs_rate numeric default 0,
  ibs_rate numeric default 0,
  cst_icms text,
  cst_pis text,
  cashback_percent numeric default 0,
  fiscal_benefit text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.parts add constraint parts_unit_chk check (unit is null or unit in ('un', 'pc', 'kg', 'lt', 'cx'));
alter table public.parts add constraint parts_origin_chk check (origin is null or origin in ('0', '1', '2', '3', '4', '5', '6', '7', '8'));

create table public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  name text not null,
  description text,
  standard_time_hours numeric default 1,
  labor_price numeric default 0,
  is_active boolean default true,
  category text,
  service_code_lc116 text default '14.01',
  municipal_service_code text,
  iss_rate numeric default 0,
  iss_retido boolean default false,
  cnae text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table public.technicians (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  cpf text,
  phone text,
  email text,
  specialty text,
  commission_percent numeric default 0,
  monthly_goal numeric default 0,
  is_active boolean default true,
  notes text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  cnpj text,
  contact_name text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  payment_terms text,
  notes text,
  is_active boolean default true,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table public.card_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  brand text not null,
  machine text default 'Geral (todas)',
  debit_rate numeric default 0,
  credit_rates jsonb,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_number text,
  customer_id text not null,
  vehicle_id text,
  plate text,
  mechanic_id text,
  status text default 'aberta',
  opened_at timestamptz,
  closed_at timestamptz,
  vehicle_km numeric,
  complaint text,
  diagnosis text,
  notes text,
  parts_items jsonb,
  service_items jsonb,
  parts_total numeric default 0,
  services_total numeric default 0,
  discount numeric default 0,
  total numeric default 0,
  photos jsonb,
  checklist jsonb,
  sale_id text,
  nfe_id text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.work_orders add constraint work_orders_status_chk check (status is null or status in ('aberta', 'em_andamento', 'aguardando_peca', 'finalizada', 'faturada', 'cancelada'));

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sale_number text,
  customer_id text,
  work_order_id text,
  type text default 'pdv',
  items jsonb,
  subtotal numeric default 0,
  discount numeric default 0,
  total numeric default 0,
  payment_method text default 'dinheiro',
  payment_details jsonb,
  status text default 'pendente',
  nfe_id text,
  notes text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.sales add constraint sales_type_chk check (type is null or type in ('os', 'pdv'));
alter table public.sales add constraint sales_payment_method_chk check (payment_method is null or payment_method in ('dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'crediario', 'misto'));
alter table public.sales add constraint sales_status_chk check (status is null or status in ('pendente', 'pago', 'cancelado'));

create table public.nfe_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sale_id text,
  work_order_id text,
  customer_id text,
  number text,
  series text default '1',
  status text default 'rascunho',
  xml_content text,
  protocol text,
  danfe_url text,
  xml_url text,
  rejection_reason text,
  emitted_at timestamptz,
  authorized_at timestamptz,
  total_amount numeric,
  items jsonb,
  taxes jsonb,
  cfop text,
  model text default 'nfce',
  rps_number text,
  rps_series text default '1',
  verification_code text,
  nfse_url text,
  iss_amount numeric,
  service_amount numeric,
  notes text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.nfe_records add constraint nfe_records_status_chk check (status is null or status in ('rascunho', 'validando', 'enviada', 'autorizada', 'rejeitada', 'cancelada'));
alter table public.nfe_records add constraint nfe_records_model_chk check (model is null or model in ('nfce', 'nfe', 'nfse'));

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  part_id text not null,
  type text default 'saida' not null,
  quantity numeric not null,
  unit_cost numeric,
  reason text,
  reference_id text,
  reference_type text,
  previous_stock numeric,
  new_stock numeric,
  notes text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.stock_movements add constraint stock_movements_type_chk check (type is null or type in ('entrada', 'saida', 'ajuste', 'devolucao'));
alter table public.stock_movements add constraint stock_movements_reference_type_chk check (reference_type is null or reference_type in ('work_order', 'sale', 'purchase', 'manual'));

create table public.credit_titles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id text not null,
  sale_id text,
  title_number text,
  installment_number numeric,
  total_installments numeric,
  original_amount numeric,
  interest_amount numeric default 0,
  total_amount numeric not null,
  paid_amount numeric default 0,
  remaining_amount numeric,
  due_date date not null,
  payment_date date,
  status text default 'a_vencer',
  payment_method text,
  notes text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.credit_titles add constraint credit_titles_status_chk check (status is null or status in ('a_vencer', 'vencido', 'pago', 'pago_parcial', 'cancelado'));

create table public.accounting_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  date date not null,
  type text default 'credit' not null,
  category text,
  description text,
  amount numeric not null,
  reference_id text,
  reference_type text,
  account_code text,
  balance_after numeric,
  notes text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.accounting_entries add constraint accounting_entries_type_chk check (type is null or type in ('debit', 'credit'));
alter table public.accounting_entries add constraint accounting_entries_reference_type_chk check (reference_type is null or reference_type in ('sale', 'payment', 'purchase', 'manual', 'tax'));

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_number text,
  supplier_id text,
  status text default 'rascunho',
  items jsonb,
  total numeric default 0,
  expected_date date,
  received_date date,
  notes text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.purchases add constraint purchases_status_chk check (status is null or status in ('rascunho', 'enviada', 'parcial', 'recebida', 'cancelada'));

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id text,
  description text not null,
  category text default 'outros',
  amount numeric not null,
  due_date date not null,
  payment_date date,
  status text default 'a_vencer',
  payment_method text default 'pix',
  recurrence text default 'unica',
  installment_number numeric default 1,
  total_installments numeric default 1,
  notes text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.bills add constraint bills_category_chk check (category is null or category in ('aluguel', 'energia', 'agua', 'telefone', 'folha', 'impostos', 'fornecedor', 'manutencao', 'marketing', 'outros'));
alter table public.bills add constraint bills_status_chk check (status is null or status in ('a_vencer', 'pago', 'vencido'));
alter table public.bills add constraint bills_payment_method_chk check (payment_method is null or payment_method in ('dinheiro', 'pix', 'transferencia', 'boleto', 'cartao', 'debito_auto'));
alter table public.bills add constraint bills_recurrence_chk check (recurrence is null or recurrence in ('unica', 'mensal', 'semanal', 'anual'));

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id text,
  vehicle_id text,
  mechanic_id text,
  scheduled_date date not null,
  scheduled_time text,
  duration_hours numeric default 1,
  service_description text not null,
  status text default 'agendado',
  notes text,
  work_order_id text,
  customer_name text,
  vehicle_desc text,
  mechanic_name text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.appointments add constraint appointments_status_chk check (status is null or status in ('agendado', 'confirmado', 'em_andamento', 'concluido', 'cancelado', 'no_show'));

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id text,
  user_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_data jsonb,
  new_data jsonb,
  ip_address text,
  description text,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
