-- O que o banco REALMENTE permite, comparado com o que as migrações dizem.
--
-- COMO RODAR: cole este arquivo no SQL Editor do Supabase e execute.
-- SOMENTE LEITURA — não cria, não altera e não apaga nada. O resultado sai
-- como tabela: uma linha por conferência.
--
-- ----------------------------------------------------------------------
-- POR QUE ESTE ARQUIVO EXISTE
--
-- 20260919000004_hardening.sql revoga current_company_id() e
-- is_super_admin() de anon. 20260920000001 revoga proximo_numero_dps() de
-- anon. Em 24/09/2026 o banco de produção tinha as três ABERTAS para anon.
-- A migração estava no repositório, revisada e mergeada, e não valia.
--
-- Duas causas diferentes: uma revogação que esqueceu `from public` (toda
-- função nasce com EXECUTE para PUBLIC, e anon herda), e um grant
-- concedido depois por fora das migrações.
--
-- rls.sql confere COMPORTAMENTO: quem enxerga o quê. Este confere FORMA:
-- quais permissões existem. São perguntas diferentes, e um vazamento pode
-- aparecer em qualquer uma das duas.
-- ----------------------------------------------------------------------

with
-- 1. Nenhuma função do schema público pode ser chamada sem login.
--    Cada uma dessas é um endereço /rest/v1/rpc/<nome> aberto na internet.
funcoes_anon as (
  select 'função executável por anon: ' || p.proname as achado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute')
),

-- 2. A porta do modelo antigo (chave digitada). Num sistema fechado
--    ninguém a chama, e ela troca o dono de qualquer chave 'available'
--    — que é o DEFAULT da coluna status.
porta_antiga as (
  select 'activate_access_key continua chamável por authenticated' as achado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'activate_access_key'
    and has_function_privilege('authenticated', p.oid, 'execute')
),

-- 3. Toda tabela de dados precisa de RLS LIGADA. Sem isso, a política
--    existe no catálogo e não vale nada.
sem_rls as (
  select 'tabela sem RLS ligada: ' || c.relname as achado
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),

-- 4. Tabela com RLS ligada e nenhuma política: fica fechada para todos,
--    inclusive para quem deveria entrar. É falha em silêncio, ao
--    contrário — a tela some em vez de vazar.
sem_politica as (
  select 'tabela com RLS e nenhuma política: ' || c.relname as achado
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = c.relname)
),

-- 5. O contrato é do provedor. Escrever em access_keys e em profiles tem
--    de exigir is_super_admin() — foi por aqui que a oficina se promoveu
--    a provedor e reescreveu a própria licença (ver 20260923000002).
escrita_do_provedor as (
  select format('%s: política %s (%s) não exige is_super_admin', p.tablename, p.policyname, p.cmd) as achado
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('access_keys', 'profiles')
    and p.cmd in ('UPDATE', 'DELETE')
    and coalesce(p.qual, '') not like '%is_super_admin%'
),

-- 6. Política de UPDATE sem WITH CHECK.
--
--    Quando WITH CHECK é omitido, o Postgres reusa a expressão do USING
--    para conferir a linha nova. Isso impede mudar a linha para FORA do
--    alcance do usuário (a oficina não pode transferir a própria licença
--    para outro e-mail), e só isso. Dentro do alcance, toda coluna fica
--    livre — foi assim que a oficina reescreveu plano, limite e
--    vencimento da própria licença em 23/09.
--
--    Não é problema por si: companies_update aparece aqui e está certo,
--    porque as colunas do provedor são seguradas pelo gatilho. Por isso é
--    AVISO. Cada linha pede a pergunta: "as colunas sensíveis desta
--    tabela estão protegidas por outra coisa?"
update_sem_check as (
  select format('AVISO %s: política %s de UPDATE sem WITH CHECK', p.tablename, p.policyname) as achado
  from pg_policies p
  where p.schemaname = 'public' and p.cmd = 'UPDATE' and p.with_check is null
),

-- 7. O gatilho que segura plano, limite e bloqueio em companies —
--    tabela que a oficina PRECISA poder editar.
trava_companies as (
  select 'gatilho companies_campos_do_provedor não está instalado' as achado
  where not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'companies' and t.tgname = 'companies_campos_do_provedor'
      and not t.tgisinternal)
),

-- 8. Os tipos de lançamento que o código grava, aceitos pelo banco.
--    Espelho de REFERENCIAS_LANCAMENTO em src/lib/caixa.js — mudou lá,
--    muda aqui. Em 24/09 a comissão passou a gravar 'commission' sem que
--    a regra aceitasse, e todo pagamento de comissão falhou em produção.
tipos_lancamento as (
  select 'lançamento com reference_type = ''' || t || ''' é recusado pelo banco' as achado
  from unnest(array['sale','payment','purchase','manual','tax','commission','refund']) t
  where not exists (
    select 1 from pg_constraint c
    where c.conname = 'accounting_entries_reference_type_chk'
      and pg_get_constraintdef(c.oid) like '%''' || t || '''%')
),

-- 9. O mesmo para movimentos de estoque. Espelho de TIPOS_MOVIMENTO e
--    REFERENCIAS_MOVIMENTO em src/lib/estoque.js. A devolução gravava
--    'estorno', recusado aqui — e cada tentativa de cancelar uma OS paga
--    inflava o estoque sem concluir.
tipos_movimento as (
  select 'movimento de estoque com ' || campo || ' = ''' || v || ''' é recusado pelo banco' as achado
  from (values
    ('type', 'stock_movements_type_chk', array['entrada','saida','ajuste','devolucao']),
    ('reference_type', 'stock_movements_reference_type_chk', array['work_order','sale','purchase','manual'])
  ) as r(campo, regra, valores), unnest(r.valores) v
  where not exists (
    select 1 from pg_constraint c
    where c.conname = r.regra and pg_get_constraintdef(c.oid) like '%''' || v || '''%')
),

problemas as (
  select achado from funcoes_anon
  union all select achado from tipos_lancamento
  union all select achado from tipos_movimento
  union all select achado from porta_antiga
  union all select achado from sem_rls
  union all select achado from sem_politica
  union all select achado from escrita_do_provedor
  union all select achado from trava_companies
),
avisos as (select achado from update_sem_check)

select 'PROBLEMA' as tipo, achado from problemas
union all
select 'aviso'    as tipo, achado from avisos
union all
select 'RESULTADO' as tipo,
       case when (select count(*) from problemas) = 0
            then 'nenhum problema — as permissões estão como as migrações dizem'
            else (select count(*) from problemas) || ' problema(s) acima' end
order by tipo desc;
