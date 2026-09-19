-- ============================================================================
-- GiroPeças — schema inicial (migração Base44 -> Supabase)
-- Gerado a partir de base44/entities/*.jsonc
--
-- Modelo de isolamento: cada usuário pertence a UMA oficina (profiles.company_id).
-- Todas as tabelas de dados são filtradas por company_id via RLS, no banco —
-- não no cliente. O super-admin (provedor) enxerga tudo.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- companies: a oficina. Não tem company_id (ela É o tenant).
-- ----------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  tax_regime text default 'simples_nacional',
  plan text default 'basic',
  is_active boolean default true,
  logo_url text,
  nfe_enabled boolean default false,
  nfe_provider_url text,
  nfe_certificate text,
  fiscal_provider text default 'focus',
  nfe_environment text default 'homologacao',
  ie text,
  im text,
  city_ibge_code text,
  cnae text,
  iss_rate numeric default 0,
  nfse_enabled boolean default false,
  nfse_series text default '1',
  nfce_series text default '1',
  nfe_series text default '1',
  csc text,
  csc_id text,
  plan_type text default 'non_fiscal',
  fiscal_note_limit numeric default 100,
  fiscal_registered boolean default false,
  fiscal_cert_expires_at date,
  fiscal_status_message text,
  credit_conditions text,
  default_interest_rate numeric default 0,
  max_installments numeric default 12,
  created_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.companies add constraint companies_tax_regime_check check (tax_regime is null or tax_regime in ('simples_nacional', 'lucro_presumido', 'lucro_real'));
alter table public.companies add constraint companies_plan_check check (plan is null or plan in ('basic', 'pro', 'enterprise'));
alter table public.companies add constraint companies_fiscal_provider_check check (fiscal_provider is null or fiscal_provider in ('focus'));
alter table public.companies add constraint companies_nfe_environment_check check (nfe_environment is null or nfe_environment in ('homologacao', 'producao'));
alter table public.companies add constraint companies_plan_type_check check (plan_type is null or plan_type in ('non_fiscal', 'fiscal'));

-- ----------------------------------------------------------------------------
-- profiles: espelha auth.users e define a qual oficina o usuário pertence.
-- É o que a RLS consulta. Substitui o filtro por created_by feito no cliente.
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  company_id uuid references public.companies(id) on delete set null,
  role text not null default 'user',
  is_super_admin boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.profiles add constraint profiles_role_check check (role in ('owner','user'));

-- Cria o profile automaticamente quando um usuário se registra.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Helpers de RLS. SECURITY DEFINER para não recair na própria política
-- de profiles (evita recursão infinita).
-- ----------------------------------------------------------------------------
create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------------
-- Tabelas de dados (todas com company_id)
-- ----------------------------------------------------------------------------

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
alter table public.access_keys add constraint access_keys_plan_type_check check (plan_type is null or plan_type in ('non_fiscal', 'fiscal'));
alter table public.access_keys add constraint access_keys_status_check check (status is null or status in ('available', 'active', 'expired', 'revoked'));

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
alter table public.customers add constraint customers_type_check check (type is null or type in ('fisica', 'juridica'));

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
alter table public.parts add constraint parts_unit_check check (unit is null or unit in ('un', 'pc', 'kg', 'lt', 'cx'));
alter table public.parts add constraint parts_origin_check check (origin is null or origin in ('0', '1', '2', '3', '4', '5', '6', '7', '8'));

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
alter table public.work_orders add constraint work_orders_status_check check (status is null or status in ('aberta', 'em_andamento', 'aguardando_peca', 'finalizada', 'faturada', 'cancelada'));

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
alter table public.sales add constraint sales_type_check check (type is null or type in ('os', 'pdv'));
alter table public.sales add constraint sales_payment_method_check check (payment_method is null or payment_method in ('dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'crediario', 'misto'));
alter table public.sales add constraint sales_status_check check (status is null or status in ('pendente', 'pago', 'cancelado'));

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
alter table public.nfe_records add constraint nfe_records_status_check check (status is null or status in ('rascunho', 'validando', 'enviada', 'autorizada', 'rejeitada', 'cancelada'));
alter table public.nfe_records add constraint nfe_records_model_check check (model is null or model in ('nfce', 'nfe', 'nfse'));

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
alter table public.stock_movements add constraint stock_movements_type_check check (type is null or type in ('entrada', 'saida', 'ajuste', 'devolucao'));
alter table public.stock_movements add constraint stock_movements_reference_type_check check (reference_type is null or reference_type in ('work_order', 'sale', 'purchase', 'manual'));

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
alter table public.credit_titles add constraint credit_titles_status_check check (status is null or status in ('a_vencer', 'vencido', 'pago', 'pago_parcial', 'cancelado'));

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
alter table public.accounting_entries add constraint accounting_entries_type_check check (type is null or type in ('debit', 'credit'));
alter table public.accounting_entries add constraint accounting_entries_reference_type_check check (reference_type is null or reference_type in ('sale', 'payment', 'purchase', 'manual', 'tax'));

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
alter table public.purchases add constraint purchases_status_check check (status is null or status in ('rascunho', 'enviada', 'parcial', 'recebida', 'cancelada'));

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
alter table public.bills add constraint bills_category_check check (category is null or category in ('aluguel', 'energia', 'agua', 'telefone', 'folha', 'impostos', 'fornecedor', 'manutencao', 'marketing', 'outros'));
alter table public.bills add constraint bills_status_check check (status is null or status in ('a_vencer', 'pago', 'vencido'));
alter table public.bills add constraint bills_payment_method_check check (payment_method is null or payment_method in ('dinheiro', 'pix', 'transferencia', 'boleto', 'cartao', 'debito_auto'));
alter table public.bills add constraint bills_recurrence_check check (recurrence is null or recurrence in ('unica', 'mensal', 'semanal', 'anual'));

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
alter table public.appointments add constraint appointments_status_check check (status is null or status in ('agendado', 'confirmado', 'em_andamento', 'concluido', 'cancelado', 'no_show'));

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

-- Índices por tenant + ordenação usual (list/filter ordenam por -created_date)
create index access_keys_company_created_idx on public.access_keys (company_id, created_date desc);
create index customers_company_created_idx on public.customers (company_id, created_date desc);
create index vehicles_company_created_idx on public.vehicles (company_id, created_date desc);
create index parts_company_created_idx on public.parts (company_id, created_date desc);
create index services_company_created_idx on public.services (company_id, created_date desc);
create index technicians_company_created_idx on public.technicians (company_id, created_date desc);
create index suppliers_company_created_idx on public.suppliers (company_id, created_date desc);
create index card_rates_company_created_idx on public.card_rates (company_id, created_date desc);
create index work_orders_company_created_idx on public.work_orders (company_id, created_date desc);
create index sales_company_created_idx on public.sales (company_id, created_date desc);
create index nfe_records_company_created_idx on public.nfe_records (company_id, created_date desc);
create index stock_movements_company_created_idx on public.stock_movements (company_id, created_date desc);
create index credit_titles_company_created_idx on public.credit_titles (company_id, created_date desc);
create index accounting_entries_company_created_idx on public.accounting_entries (company_id, created_date desc);
create index purchases_company_created_idx on public.purchases (company_id, created_date desc);
create index bills_company_created_idx on public.bills (company_id, created_date desc);
create index appointments_company_created_idx on public.appointments (company_id, created_date desc);
create index audit_logs_company_created_idx on public.audit_logs (company_id, created_date desc);
create index profiles_company_idx on public.profiles (company_id);

-- ----------------------------------------------------------------------------
-- RLS — o isolamento entre oficinas acontece AQUI, no banco.
-- Sem isto, a chave anon (pública) permitiria ler dados de outras oficinas.
-- ----------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.access_keys enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.parts enable row level security;
alter table public.services enable row level security;
alter table public.technicians enable row level security;
alter table public.suppliers enable row level security;
alter table public.card_rates enable row level security;
alter table public.work_orders enable row level security;
alter table public.sales enable row level security;
alter table public.nfe_records enable row level security;
alter table public.stock_movements enable row level security;
alter table public.credit_titles enable row level security;
alter table public.accounting_entries enable row level security;
alter table public.purchases enable row level security;
alter table public.bills enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: cada um lê/edita o próprio; super-admin vê todos.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_super_admin());

-- companies: só a própria oficina; super-admin vê todas.
create policy companies_select on public.companies for select
  using (id = public.current_company_id() or public.is_super_admin());
create policy companies_insert on public.companies for insert
  with check (auth.uid() is not null);
create policy companies_update on public.companies for update
  using (id = public.current_company_id() or public.is_super_admin());
create policy companies_delete on public.companies for delete
  using (public.is_super_admin());

-- Tabelas de dados: tudo escopado por company_id.
create policy access_keys_all on public.access_keys for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy customers_all on public.customers for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy vehicles_all on public.vehicles for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy parts_all on public.parts for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy services_all on public.services for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy technicians_all on public.technicians for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy suppliers_all on public.suppliers for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy card_rates_all on public.card_rates for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy work_orders_all on public.work_orders for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy sales_all on public.sales for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy nfe_records_all on public.nfe_records for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy stock_movements_all on public.stock_movements for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy credit_titles_all on public.credit_titles for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy accounting_entries_all on public.accounting_entries for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy purchases_all on public.purchases for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy bills_all on public.bills for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy appointments_all on public.appointments for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
create policy audit_logs_all on public.audit_logs for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

-- access_keys é do provedor: só o super-admin gerencia. A oficina apenas
-- consulta a chave que ativou (por isso a política de select é mais ampla).
drop policy access_keys_all on public.access_keys;
create policy access_keys_select on public.access_keys for select
  using (true);
create policy access_keys_write on public.access_keys for insert
  with check (public.is_super_admin());
create policy access_keys_update on public.access_keys for update
  using (public.is_super_admin() or activated_by = auth.jwt()->>'email');
create policy access_keys_delete on public.access_keys for delete
  using (public.is_super_admin());

-- updated_date automático
create or replace function public.touch_updated_date()
returns trigger language plpgsql as $$
begin new.updated_date = now(); return new; end; $$;
create trigger access_keys_touch before update on public.access_keys for each row execute function public.touch_updated_date();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_date();
create trigger vehicles_touch before update on public.vehicles for each row execute function public.touch_updated_date();
create trigger parts_touch before update on public.parts for each row execute function public.touch_updated_date();
create trigger services_touch before update on public.services for each row execute function public.touch_updated_date();
create trigger technicians_touch before update on public.technicians for each row execute function public.touch_updated_date();
create trigger suppliers_touch before update on public.suppliers for each row execute function public.touch_updated_date();
create trigger card_rates_touch before update on public.card_rates for each row execute function public.touch_updated_date();
create trigger work_orders_touch before update on public.work_orders for each row execute function public.touch_updated_date();
create trigger sales_touch before update on public.sales for each row execute function public.touch_updated_date();
create trigger nfe_records_touch before update on public.nfe_records for each row execute function public.touch_updated_date();
create trigger stock_movements_touch before update on public.stock_movements for each row execute function public.touch_updated_date();
create trigger credit_titles_touch before update on public.credit_titles for each row execute function public.touch_updated_date();
create trigger accounting_entries_touch before update on public.accounting_entries for each row execute function public.touch_updated_date();
create trigger purchases_touch before update on public.purchases for each row execute function public.touch_updated_date();
create trigger bills_touch before update on public.bills for each row execute function public.touch_updated_date();
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_date();
create trigger audit_logs_touch before update on public.audit_logs for each row execute function public.touch_updated_date();
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_date();
