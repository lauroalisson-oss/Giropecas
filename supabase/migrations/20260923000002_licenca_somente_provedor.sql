-- Fecha as portas que deixavam a PRÓPRIA oficina reescrever o que só o
-- provedor pode decidir: se ela é super-admin, de qual empresa ela é, e
-- até quando a licença vale.
--
-- O problema não era a falta de RLS — era o formato das políticas de
-- UPDATE. Elas diziam QUAIS LINHAS o usuário alcança, e nenhuma dizia
-- QUAIS COLUNAS ele pode mexer. "A linha é sua" virou "a linha é sua para
-- fazer o que quiser com ela".
--
-- Provado no banco de produção (dentro de transação desfeita):
--
--   1) o dono da oficina, com o próprio login, rodou um UPDATE na sua
--      licença e saiu com plan_type='fiscal', 999999 notas/mês e
--      vencimento em 2099 — a licença dele estava VENCIDA desde 22/09;
--
--   2) o mesmo dono rodou `update profiles set is_super_admin = true
--      where id = auth.uid()` e passou a enxergar as 2 empresas e as 2
--      licenças do banco, em vez da dele.
--
-- O (2) é a falha grave: derruba o isolamento entre oficinas inteiro. Não
-- adianta a rota de NFS-e conferir a licença no servidor se o dado que ela
-- confere é escrito pelo cliente.

-- ---------------------------------------------------------------------
-- 1. profiles: quem é super-admin e de que empresa, só o provedor decide
-- ---------------------------------------------------------------------
-- O aplicativo NUNCA escreve em profiles pelo navegador: ele só lê
-- (User.list). As duas escritas legítimas do lojista — marcar a senha
-- trocada e concluir o onboarding — passam por funções SECURITY DEFINER,
-- que rodam como dono da tabela e não dependem desta política.
--
-- O provisionamento usa a service_role (api/provisionarEmpresa.js), que
-- ignora RLS. Então tirar o lojista daqui não quebra nenhum fluxo.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- O insert existia para o primeiro acesso, antes de o perfil existir. Sem
-- amarra, um usuário podia nascer com is_super_admin = true.
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  with check (
    public.is_super_admin()
    or (id = auth.uid() and coalesce(is_super_admin, false) = false)
  );

-- ---------------------------------------------------------------------
-- 2. access_keys: a licença é um documento do provedor
-- ---------------------------------------------------------------------
-- Ler continua valendo (a tela precisa mostrar plano e vencimento).
-- Escrever, não: prazo, plano, limite e status são o que o provedor vende.
drop policy if exists access_keys_update on public.access_keys;
create policy access_keys_update on public.access_keys for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- A única escrita que o lojista precisava fazer era carimbar a licença
-- como vencida ao entrar. Vira função: ela só sabe fazer isso, só na
-- licença de quem chamou, e só quando a data JÁ passou de verdade.
create or replace function public.marcar_licenca_vencida()
returns integer language plpgsql security definer set search_path = public as $fn$
declare u_email text; n integer;
begin
  u_email := auth.jwt()->>'email';
  if u_email is null then raise exception 'Usuário não autenticado.'; end if;

  update public.access_keys
     set status = 'expired'
   where activated_by = u_email
     and status = 'active'
     and expires_at is not null
     and expires_at <= now();

  get diagnostics n = row_count;
  return n;
end $fn$;

revoke execute on function public.marcar_licenca_vencida() from public, anon;
grant execute on function public.marcar_licenca_vencida() to authenticated;

-- ---------------------------------------------------------------------
-- 3. companies: a oficina edita a oficina, não o contrato
-- ---------------------------------------------------------------------
-- Aqui o lojista PRECISA escrever: nome, CNPJ, endereço, alíquota de ISS,
-- série da NFS-e. Mas plan_type, fiscal_note_limit e is_active moram na
-- mesma tabela e são do provedor. Como uma política WITH CHECK enxerga só
-- a linha nova, e a pergunta aqui é "mudou?", a trava é um gatilho.
create or replace function public.companies_campos_do_provedor()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if public.is_super_admin() then return new; end if;

  if new.plan_type is distinct from old.plan_type
     or new.fiscal_note_limit is distinct from old.fiscal_note_limit
     or new.is_active is distinct from old.is_active then
    raise exception 'Plano, limite de notas e bloqueio são definidos pelo provedor.'
      using errcode = '42501';
  end if;
  return new;
end $fn$;

revoke execute on function public.companies_campos_do_provedor() from public, anon, authenticated;

drop trigger if exists companies_campos_do_provedor on public.companies;
create trigger companies_campos_do_provedor
  before update on public.companies
  for each row execute function public.companies_campos_do_provedor();

-- ---------------------------------------------------------------------
-- 4. anon não escreve em nada disto
-- ---------------------------------------------------------------------
-- A RLS já barrava (auth.jwt() é nulo e is_super_admin() não é executável
-- por anon), mas o GRANT continuava lá. Duas trancas na mesma porta.
revoke insert, update, delete on public.access_keys from anon;
revoke insert, update, delete on public.profiles    from anon;
revoke insert, update, delete on public.companies   from anon;

-- Atenção a quem for mexer nisto depois: o provedor entra no banco com o
-- MESMO papel do lojista (authenticated). Quem separa os dois é a política
-- RLS, nunca o GRANT — revogar update de authenticated aqui tiraria o
-- painel do provedor junto.
