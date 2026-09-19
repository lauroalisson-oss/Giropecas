-- Cliente: data de nascimento (opcional no cadastro, exigida no crediário).
-- O CPF já existe como tax_id.
alter table public.customers add column birth_date date;

-- Serviço: de quanto em quanto tempo / km ele precisa ser refeito.
alter table public.services add column interval_months numeric;
alter table public.services add column interval_km numeric;

create index customers_birth_month_idx
  on public.customers (company_id, (extract(month from birth_date)))
  where birth_date is not null;

-- A previsão de revisão é DERIVADA das ordens de serviço (data + km do
-- veículo + serviços da OS), então não há tabela nova.
create index work_orders_vehicle_idx on public.work_orders (company_id, vehicle_id, created_date desc);
