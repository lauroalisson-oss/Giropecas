\set QUIET on
delete from public.access_keys;
insert into public.access_keys (key,duration_days,status,client_name) values
  ('GIRO-LIVRE-0000-0001',30,'available','Licença não usada'),
  ('GIRO-USADA-0000-0002',30,'active','Da Oficina A');
update public.access_keys set activated_by='a@a.com' where key='GIRO-USADA-0000-0002';
\set QUIET off

\echo '=== 1. Usuario A lista licencas (esperado: 1 = so a dele; a LIVRE nao pode aparecer) ==='
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"a@a.com"}';
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) as visiveis, coalesce(string_agg(key,','),'-') as quais from public.access_keys;
commit;

\echo '=== 2. Super-admin lista licencas (esperado: 2) ==='
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","email":"lauro.alisson@gmail.com"}';
  set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
  select count(*) as visiveis from public.access_keys;
commit;

\echo '=== 3. Usuario B ativa a chave livre via RPC (esperado: sucesso) ==='
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","email":"b@b.com"}';
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
  select (public.activate_access_key('GIRO-LIVRE-0000-0001')).status as status_apos_ativar;
commit;

\echo '=== 4. Usuario A tenta ativar a MESMA chave (esperado: erro "ja foi utilizada") ==='
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"a@a.com"}';
  do $$ begin
    perform public.activate_access_key('GIRO-LIVRE-0000-0001');
    raise notice '>>> FALHA: reuso de chave PERMITIDO';
  exception when others then raise notice '>>> OK: %', sqlerrm;
  end $$;
rollback;

\echo '=== 5. Usuario comum tenta CRIAR licenca (esperado: bloqueado) ==='
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"a@a.com"}';
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  do $$ begin
    insert into public.access_keys (key,duration_days,status) values ('GIRO-PIRATA-0000-0003',365,'available');
    raise notice '>>> FALHA: usuario comum criou licenca';
  exception when others then raise notice '>>> OK: criacao bloqueada';
  end $$;
rollback;
