-- O arquivo dizia uma coisa, o banco fazia outra — e ninguém perceberia.
--
-- 20260919000004_hardening.sql revoga current_company_id() e
-- is_super_admin() de anon. 20260920000001 revoga proximo_numero_dps() de
-- anon. O banco de produção, conferido hoje, tinha as três abertas para
-- anon: qualquer um, sem login, chamando /rest/v1/rpc/...
--
-- Nenhuma das três entrega nada a quem não entrou (as duas primeiras
-- devolvem nulo/falso sem auth.uid(); a terceira levanta exceção). Mas o
-- estrago não é o que elas devolvem — é que uma revogação escrita numa
-- migração não valeu, e passou meses assim. É a mesma doença do resto
-- deste sistema: um valor derivado guardado numa coluna que as telas leem
-- como verdade enquanto a origem mudou por baixo. Aqui a "coluna" é o
-- arquivo de migração e a origem é o banco.
--
-- Duas causas distintas:
--
--   * proximo_numero_dps: `revoke ... from anon` sem `from public`. No
--     Postgres toda função nasce com EXECUTE para PUBLIC, e anon é membro
--     de PUBLIC — a revogação tirou o acesso direto e deixou o herdado.
--
--   * current_company_id / is_super_admin: o revoke incluía `public`, mas
--     o banco tem um grant EXPLÍCITO para anon. Foi concedido depois, por
--     fora das migrações.
--
-- Por isso o conserto vem com supabase/tests/permissoes.sql, que confere a
-- forma pretendida contra o banco de verdade. Sem ele, isto volta.

revoke execute on function public.current_company_id()   from public, anon;
revoke execute on function public.is_super_admin()       from public, anon;
revoke execute on function public.proximo_numero_dps()   from public, anon;
revoke execute on function public.marcar_licenca_vencida() from public, anon;
revoke execute on function public.mark_password_changed()  from public, anon;
revoke execute on function public.mark_onboarding_complete() from public, anon;

-- Reafirma quem PODE. O provedor entra com o mesmo papel do lojista
-- (authenticated); quem separa os dois é a política RLS, nunca o grant.
grant execute on function public.current_company_id()        to authenticated;
grant execute on function public.is_super_admin()            to authenticated;
grant execute on function public.proximo_numero_dps()        to authenticated;
grant execute on function public.marcar_licenca_vencida()    to authenticated;
grant execute on function public.mark_password_changed()     to authenticated;
grant execute on function public.mark_onboarding_complete()  to authenticated;

-- ---------------------------------------------------------------------
-- activate_access_key: porta sem uso num sistema fechado
-- ---------------------------------------------------------------------
-- Veio do modelo antigo, em que o lojista digitava a chave. Hoje o
-- provedor cria a licença já ativa e vinculada (api/provisionarEmpresa.js);
-- nenhuma linha do aplicativo chama esta função.
--
-- Ela troca o dono de qualquer chave com status 'available' por quem
-- chamar. Não há nenhuma assim no banco agora — mas 'available' é o
-- DEFAULT da coluna: basta uma linha inserida à mão pelo painel do
-- Supabase, sem informar o status, para que qualquer oficina logada possa
-- reivindicá-la. Fecha-se a porta em vez de contar com a disciplina de
-- quem for inserir.
--
-- A função fica no banco, não é derrubada: se o modelo de chave digitada
-- voltar, é um grant de uma linha. Derrubar perderia o texto dela.
revoke execute on function public.activate_access_key(text) from public, anon, authenticated;
