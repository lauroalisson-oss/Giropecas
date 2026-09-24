-- Isolamento entre oficinas (Row Level Security), contra o banco de verdade.
--
-- COMO RODAR: cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- O resultado sai como uma MENSAGEM DE ERRO — isso é de propósito, leia abaixo.
--
-- ----------------------------------------------------------------------
-- POR QUE TERMINA EM ERRO
--
-- O teste precisa criar duas oficinas de mentira e entrar como cada uma
-- delas. Isso é escrita no banco de produção. Para que NADA disso possa
-- sobrar, o bloco termina levantando uma exceção de propósito: o Postgres
-- desfaz tudo o que foi feito, e o relatório vem junto na mensagem.
--
-- Ou seja: "ERROR: === RESULTADO RLS ===" é o sucesso. Leia as linhas.
-- Se todas disserem [ok], o isolamento está de pé.
--
-- ----------------------------------------------------------------------
-- O QUE ESTE ARQUIVO SUBSTITUIU
--
-- As versões anteriores (rls_isolamento.sql e rls_licencas.sql) começavam
-- com "delete from public.customers" e "delete from public.access_keys",
-- sem filtro nenhum. Foram escritas quando o banco estava vazio. Rodar
-- qualquer uma delas hoje apagaria os clientes de todas as oficinas e
-- todas as licenças — trancando cada lojista para fora do sistema.
--
-- Este arquivo não apaga nada: cria o que precisa, confere, e desfaz.
-- ----------------------------------------------------------------------

do $teste$
declare
  A  uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';
  B  uuid := 'bbbbbbbb-0000-4000-8000-00000000000b';
  uA uuid := 'aaaaaaaa-1111-4000-8000-00000000000a';
  uB uuid := 'bbbbbbbb-1111-4000-8000-00000000000b';
  uS uuid := 'cccccccc-1111-4000-8000-00000000000c';
  r text := '';
  n int;
  falhas int := 0;
  papel text := current_setting('role', true);

begin
  -- ===================== Oficinas de mentira =========================
  insert into auth.users (id, email) values
    (uA, 'rls-a@teste.invalid'), (uB, 'rls-b@teste.invalid'), (uS, 'rls-s@teste.invalid');

  insert into public.companies (id, name) values (A, 'Oficina A (teste)'), (B, 'Oficina B (teste)');

  -- O gatilho on_auth_user_created já criou os perfis; aqui só vinculamos.
  update public.profiles set company_id = A, role = 'owner' where id = uA;
  update public.profiles set company_id = B, role = 'owner' where id = uB;
  update public.profiles set is_super_admin = true where id = uS;

  insert into public.customers (company_id, name) values (A, 'Cliente da A'), (B, 'Cliente da B');

  insert into public.access_keys
    (company_id, key, duration_days, status, activated_by, plan_type, fiscal_note_limit, expires_at)
  values
    (A, 'TESTE-A', 30, 'active', 'rls-a@teste.invalid', 'fiscal',  50, now() + interval '30 days'),
    (B, 'TESTE-B', 30, 'active', 'rls-b@teste.invalid', 'fiscal', 999, now() + interval '30 days');

  -- ===================== Entrando como a Oficina A ====================
  perform set_config('request.jwt.claims',
    json_build_object('sub', uA::text, 'role', 'authenticated', 'email', 'rls-a@teste.invalid')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.customers;
  if n <> 1 then falhas := falhas + 1; end if;
  r := r || format('[%s] A vê apenas os próprios clientes (viu %s)%s',
    case when n = 1 then 'ok' else 'FALHA' end, n, chr(10));

  select count(*) into n from public.customers where company_id = B;
  if n <> 0 then falhas := falhas + 1; end if;
  r := r || format('[%s] A não alcança cliente da B (viu %s)%s',
    case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));

  select count(*) into n from public.companies;
  if n <> 1 then falhas := falhas + 1; end if;
  r := r || format('[%s] A vê apenas a própria oficina (viu %s)%s',
    case when n = 1 then 'ok' else 'FALHA' end, n, chr(10));

  -- A política de access_keys já deixou passar TODAS as licenças uma vez.
  -- Estas duas linhas existem para que isso não volte sem ninguém notar.
  select count(*) into n from public.access_keys;
  if n <> 1 then falhas := falhas + 1; end if;
  r := r || format('[%s] A vê apenas a própria licença (viu %s)%s',
    case when n = 1 then 'ok' else 'FALHA' end, n, chr(10));

  select count(*) into n from public.access_keys where fiscal_note_limit = 999;
  if n <> 0 then falhas := falhas + 1; end if;
  r := r || format('[%s] A não enxerga o plano contratado pela B (viu %s)%s',
    case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));

  -- ----- Escrita -----
  begin
    insert into public.customers (company_id, name) values (B, 'Invasor');
    falhas := falhas + 1;
    r := r || '[FALHA] A CONSEGUIU inserir cliente na B' || chr(10);
  exception when others then
    r := r || '[ok] A não consegue inserir na B' || chr(10);
  end;

  update public.customers set name = 'Sequestrado' where company_id = B;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas + 1; end if;
  r := r || format('[%s] A não altera cliente da B (%s linhas)%s',
    case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));

  delete from public.customers where company_id = B;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas + 1; end if;
  r := r || format('[%s] A não apaga cliente da B (%s linhas)%s',
    case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));

  begin
    update public.companies set name = 'Roubada' where id = B;
    get diagnostics n = row_count;
    if n <> 0 then falhas := falhas + 1; end if;
    r := r || format('[%s] A não renomeia a oficina B (%s linhas)%s',
      case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));
  exception when others then
    r := r || '[ok] A não renomeia a oficina B (bloqueado)' || chr(10);
  end;

  -- ===================== Escalada de privilégio =======================
  -- Ler a linha certa não basta: a política de UPDATE dizia QUAIS LINHAS o
  -- usuário alcança e nenhuma dizia QUAIS COLUNAS ele pode mexer. Com isso,
  -- a oficina A reescrevia a própria licença (plano, limite e vencimento) e
  -- — pior — se promovia a super-admin com um UPDATE no próprio perfil,
  -- passando a enxergar todas as oficinas. Foi reproduzido no banco de
  -- produção antes do conserto. Estas linhas existem para que não volte.

  update public.profiles set is_super_admin = true where id = uA;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas + 1; end if;
  r := r || format('[%s] A não se promove a super-admin (%s linhas)%s',
    case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));

  -- Se a linha acima tiver passado, esta mostra o tamanho do estrago.
  select count(*) into n from public.companies;
  if n <> 1 then falhas := falhas + 1; end if;
  r := r || format('[%s] A continua vendo só a própria oficina (viu %s)%s',
    case when n = 1 then 'ok' else 'FALHA' end, n, chr(10));

  update public.profiles set company_id = B where id = uA;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas + 1; end if;
  r := r || format('[%s] A não se muda para dentro da oficina B (%s linhas)%s',
    case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));

  update public.access_keys
     set expires_at = now() + interval '30 years', status = 'active',
         plan_type = 'fiscal', fiscal_note_limit = 999999
   where activated_by = 'rls-a@teste.invalid';
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas + 1; end if;
  r := r || format('[%s] A não estende nem melhora a própria licença (%s linhas)%s',
    case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));

  -- Plano e limite também moram em companies, tabela que a oficina PRECISA
  -- poder editar. Lá quem segura é o gatilho, não a política.
  begin
    update public.companies set plan_type = 'fiscal', fiscal_note_limit = 999999 where id = A;
    falhas := falhas + 1;
    r := r || '[FALHA] A CONSEGUIU mudar o próprio plano em companies' || chr(10);
  exception when others then
    r := r || '[ok] A não muda o próprio plano em companies' || chr(10);
  end;

  -- E o que ela legitimamente edita tem de continuar funcionando: se esta
  -- linha falhar, a trava acima apertou demais e quebrou Configurações.
  update public.companies set name = 'Oficina A (renomeada)', iss_rate = 3 where id = A;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas + 1; end if;
  r := r || format('[%s] A ainda edita os próprios dados de cadastro (%s linhas)%s',
    case when n = 1 then 'ok' else 'FALHA' end, n, chr(10));

  -- A função que substituiu a escrita direta: só carimba 'expired', e só
  -- quando a data já passou. A licença da A está em dia, então: 0 linhas.
  select public.marcar_licenca_vencida() into n;
  if n <> 0 then falhas := falhas + 1; end if;
  r := r || format('[%s] marcar_licenca_vencida não mexe em licença em dia (%s linhas)%s',
    case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));

  -- ===================== Provedor (super-admin) =======================
  perform set_config('request.jwt.claims',
    json_build_object('sub', uS::text, 'role', 'authenticated', 'email', 'rls-s@teste.invalid')::text, true);

  select count(*) into n from public.companies where id in (A, B);
  if n <> 2 then falhas := falhas + 1; end if;
  r := r || format('[%s] super-admin vê as duas oficinas (viu %s)%s',
    case when n = 2 then 'ok' else 'FALHA' end, n, chr(10));

  select count(*) into n from public.customers where company_id in (A, B);
  if n <> 2 then falhas := falhas + 1; end if;
  r := r || format('[%s] super-admin vê os dois clientes (viu %s)%s',
    case when n = 2 then 'ok' else 'FALHA' end, n, chr(10));

  -- O provedor entra no banco com o MESMO papel do lojista (authenticated);
  -- quem separa os dois é só a política. Fechar a escrita do lojista sem
  -- fechar a do provedor é a parte que dá errado — e é o painel Admin que
  -- para de funcionar. Estas três linhas conferem que ele continua de pé.
  update public.access_keys set expires_at = now() + interval '365 days', plan_type = 'fiscal'
   where activated_by = 'rls-a@teste.invalid';
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas + 1; end if;
  r := r || format('[%s] provedor renova a licença da A (%s linhas)%s',
    case when n = 1 then 'ok' else 'FALHA' end, n, chr(10));

  update public.profiles set role = 'owner' where id = uA;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas + 1; end if;
  r := r || format('[%s] provedor ainda edita perfis (%s linhas)%s',
    case when n = 1 then 'ok' else 'FALHA' end, n, chr(10));

  update public.companies set plan_type = 'fiscal', fiscal_note_limit = 500 where id = A;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas + 1; end if;
  r := r || format('[%s] provedor muda plano e limite em companies (%s linhas)%s',
    case when n = 1 then 'ok' else 'FALHA' end, n, chr(10));

  -- ===================== Visitante não autenticado ====================
  -- Duas maneiras de passar, e as duas servem:
  --   * a consulta devolve 0 linhas (a política não deixou passar nada);
  --   * a consulta nem roda ("permission denied for function"), porque
  --     anon não executa mais current_company_id()/is_super_admin().
  -- A segunda é a mais forte: barra antes de olhar a tabela. Aceitar só a
  -- primeira faria este arquivo acusar falha justamente quando o banco
  -- ficou MAIS fechado.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);

  begin
    select count(*) into n from public.customers;
    if n <> 0 then falhas := falhas + 1; end if;
    r := r || format('[%s] anônimo não lê cliente nenhum (viu %s)%s',
      case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));
  exception when others then
    r := r || '[ok] anônimo não lê cliente nenhum (barrado antes da consulta)' || chr(10);
  end;

  begin
    select count(*) into n from public.companies;
    if n <> 0 then falhas := falhas + 1; end if;
    r := r || format('[%s] anônimo não lê oficina nenhuma (viu %s)%s',
      case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));
  exception when others then
    r := r || '[ok] anônimo não lê oficina nenhuma (barrado antes da consulta)' || chr(10);
  end;

  begin
    select count(*) into n from public.access_keys;
    if n <> 0 then falhas := falhas + 1; end if;
    r := r || format('[%s] anônimo não lê licença nenhuma (viu %s)%s',
      case when n = 0 then 'ok' else 'FALHA' end, n, chr(10));
  exception when others then
    r := r || '[ok] anônimo não lê licença nenhuma (barrado antes da consulta)' || chr(10);
  end;

  perform set_config('role', coalesce(papel, 'postgres'), true);

  -- EXCEÇÃO DE PROPÓSITO: é o que garante que nada disto seja gravado.
  raise exception E'\n=== RESULTADO RLS ===\n%\n%',
    r,
    case when falhas = 0
      then 'TUDO OK — o isolamento entre oficinas está de pé. (Nada foi gravado.)'
      else format('%s FALHA(S) — leia as linhas acima. (Nada foi gravado.)', falhas)
    end;
end $teste$;
