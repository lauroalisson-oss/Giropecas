-- Correções do verificador de segurança + fechamento da exposição de licenças.
-- (conteúdo idêntico ao aplicado no projeto Supabase)

create or replace function public.touch_updated_date()
returns trigger language plpgsql set search_path = public as $fn$
begin new.updated_date = now(); return new; end $fn$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_date() from public, anon, authenticated;

-- ATENÇÃO: current_company_id/is_super_admin são CHAMADAS pelas políticas.
-- Revogar de authenticated quebra todas as consultas com
-- "permission denied for function" (verificado em teste). Mantemos para
-- authenticated e tiramos de anon.
revoke execute on function public.current_company_id() from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- access_keys: "using (true)" expunha TODAS as licenças, inclusive as
-- disponíveis — qualquer um poderia descobrir e ativar uma de graça.
drop policy if exists access_keys_select on public.access_keys;
create policy access_keys_select on public.access_keys for select
  using (public.is_super_admin() or activated_by = auth.jwt()->>'email');

create or replace function public.activate_access_key(p_key text)
returns public.access_keys language plpgsql security definer set search_path = public as $fn$
declare k public.access_keys; u_email text;
begin
  u_email := auth.jwt()->>'email';
  if u_email is null then raise exception 'Usuário não autenticado.'; end if;
  select * into k from public.access_keys where key = p_key;
  if not found then raise exception 'Chave não encontrada. Solicite uma chave ao administrador.'; end if;
  if k.status = 'revoked' then raise exception 'Esta chave foi revogada.'; end if;
  if k.status = 'expired' or (k.expires_at is not null and k.expires_at < now()) then
    update public.access_keys set status = 'expired' where id = k.id;
    raise exception 'Esta chave já venceu. Solicite uma nova chave.';
  end if;
  if k.status = 'active' then
    if k.activated_by = u_email then return k; end if;
    raise exception 'Esta chave já foi utilizada.';
  end if;
  if k.status <> 'available' then raise exception 'Esta chave não está disponível.'; end if;
  update public.access_keys
     set status = 'active', activated_by = u_email, activated_at = now()
   where id = k.id returning * into k;
  return k;
end $fn$;

revoke execute on function public.activate_access_key(text) from public, anon;
grant execute on function public.activate_access_key(text) to authenticated;
