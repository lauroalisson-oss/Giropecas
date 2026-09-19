-- Núcleo: empresa (tenant), perfis e helpers de RLS.
create extension if not exists "pgcrypto";

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
alter table public.companies add constraint companies_tax_regime_chk check (tax_regime is null or tax_regime in ('simples_nacional', 'lucro_presumido', 'lucro_real'));
alter table public.companies add constraint companies_plan_chk check (plan is null or plan in ('basic', 'pro', 'enterprise'));
alter table public.companies add constraint companies_fiscal_provider_chk check (fiscal_provider is null or fiscal_provider in ('focus'));
alter table public.companies add constraint companies_nfe_environment_chk check (nfe_environment is null or nfe_environment in ('homologacao', 'producao'));
alter table public.companies add constraint companies_plan_type_chk check (plan_type is null or plan_type in ('non_fiscal', 'fiscal'));

-- profiles espelha auth.users e diz a qual oficina o usuário pertence.
-- É o que a RLS consulta (substitui o filtro por created_by feito no cliente).
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
alter table public.profiles add constraint profiles_role_chk check (role in ('owner','user'));
create index profiles_company_idx on public.profiles (company_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $fn$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- SECURITY DEFINER: evita recair na própria política de profiles (recursão).
create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $fn$
  select company_id from public.profiles where id = auth.uid();
$fn$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
$fn$;

create or replace function public.touch_updated_date()
returns trigger language plpgsql as $fn$
begin new.updated_date = now(); return new; end $fn$;
