\set QUIET on
\pset footer off
-- limpa resíduo do teste anterior
delete from public.customers;
insert into public.customers (company_id,name) values
  ('11111111-1111-1111-1111-111111111111','Cliente da A'),
  ('22222222-2222-2222-2222-222222222222','Cliente da B');
\set QUIET off

\echo '=== 1. Usuario A lista clientes (esperado: 1 = "Cliente da A") ==='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) as visiveis, coalesce(string_agg(name,','),'-') as quais from public.customers;
commit;

\echo '=== 2. Usuario A tenta ler dados da Oficina B (esperado: 0) ==='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) as vazamento from public.customers where company_id='22222222-2222-2222-2222-222222222222';
commit;

\echo '=== 3. Usuario A lista empresas (esperado: 1) ==='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) as empresas from public.companies;
commit;

\echo '=== 4. Super-admin ve tudo (esperado: 2 e 2) ==='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
  select (select count(*) from public.customers) as clientes, (select count(*) from public.companies) as empresas;
commit;

\echo '=== 5. Usuario A tenta INSERIR na Oficina B (esperado: bloqueado) ==='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  do $$ begin
    insert into public.customers (company_id,name) values ('22222222-2222-2222-2222-222222222222','Invasor');
    raise notice '>>> FALHA DE SEGURANCA: insercao cruzada PERMITIDA';
  exception when others then raise notice '>>> OK: insercao cruzada bloqueada';
  end $$;
rollback;

\echo '=== 6. Usuario A tenta APAGAR da Oficina B (esperado: 0 apagados) ==='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  with d as (delete from public.customers where company_id='22222222-2222-2222-2222-222222222222' returning 1)
  select count(*) as apagados from d;
rollback;

\echo '=== 7. Usuario SEM empresa (recem-registrado) nao ve nada (esperado: 0) ==='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
  update public.profiles set company_id = null where id='bbbbbbbb-0000-0000-0000-000000000002';
commit;
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
  select count(*) as visiveis from public.customers;
commit;
