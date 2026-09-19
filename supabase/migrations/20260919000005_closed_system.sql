-- Sistema fechado: quem provisiona é o super-admin. Não há auto-cadastro.
-- (conteúdo idêntico ao aplicado no projeto Supabase)

alter table public.profiles add column must_change_password boolean not null default false;
alter table public.profiles add column onboarding_status text not null default 'pendente';
alter table public.profiles add constraint profiles_onboarding_chk
  check (onboarding_status in ('pendente','senha_trocada','concluido'));

create policy profiles_insert on public.profiles for insert
  with check (id = auth.uid() or public.is_super_admin());

create or replace function public.mark_password_changed()
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  update public.profiles
     set must_change_password = false,
         onboarding_status = case when onboarding_status = 'pendente'
                                  then 'senha_trocada' else onboarding_status end
   where id = auth.uid();
end $fn$;
revoke execute on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;

create or replace function public.mark_onboarding_complete()
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  update public.profiles set onboarding_status = 'concluido' where id = auth.uid();
end $fn$;
revoke execute on function public.mark_onboarding_complete() from public, anon;
grant execute on function public.mark_onboarding_complete() to authenticated;
