-- RLS, índices e triggers. O isolamento entre oficinas acontece AQUI:
-- a chave anon é pública, então filtrar no cliente não protege nada.

alter table public.companies enable row level security;
alter table public.profiles  enable row level security;

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_super_admin());

create policy companies_select on public.companies for select
  using (id = public.current_company_id() or public.is_super_admin());
create policy companies_insert on public.companies for insert
  with check (auth.uid() is not null);
create policy companies_update on public.companies for update
  using (id = public.current_company_id() or public.is_super_admin());
create policy companies_delete on public.companies for delete
  using (public.is_super_admin());
create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_date();

do $do$
declare t text;
begin
  foreach t in array array['access_keys', 'customers', 'vehicles', 'parts', 'services', 'technicians', 'suppliers', 'card_rates', 'work_orders', 'sales', 'nfe_records', 'stock_movements', 'credit_titles', 'accounting_entries', 'purchases', 'bills', 'appointments', 'audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create index %I on public.%I (company_id, created_date desc)', t||'_company_created_idx', t);
    execute format($p$create policy %I on public.%I for all
      using (company_id = public.current_company_id() or public.is_super_admin())
      with check (company_id = public.current_company_id() or public.is_super_admin())$p$, t||'_tenant', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_date()', t||'_touch', t);
  end loop;
end $do$;

-- access_keys é do provedor: a oficina precisa LER a chave para ativá-la
-- (antes de ter empresa), mas só o super-admin cria/exclui.
drop policy access_keys_tenant on public.access_keys;
alter table public.access_keys alter column company_id drop not null;
create policy access_keys_select on public.access_keys for select using (true);
create policy access_keys_insert on public.access_keys for insert with check (public.is_super_admin());
create policy access_keys_update on public.access_keys for update
  using (public.is_super_admin() or activated_by = auth.jwt()->>'email');
create policy access_keys_delete on public.access_keys for delete using (public.is_super_admin());
