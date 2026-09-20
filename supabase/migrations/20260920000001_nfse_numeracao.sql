-- Numeração da DPS (Declaração de Prestação de Serviços).
--
-- Cada DPS precisa de um número sequencial por oficina. Duas OS emitidas no
-- mesmo instante NÃO podem receber o mesmo número — o Sefin rejeita a
-- segunda como duplicada. Por isso o número sai de uma linha no banco, com
-- incremento atômico, e não de um count() no aplicativo.

create table public.nfse_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  serie text not null default '1',
  ultimo_numero bigint not null default 0,
  updated_date timestamptz not null default now()
);

alter table public.nfse_counters enable row level security;

-- A tabela é manipulada só pela função abaixo (security definer). Nenhuma
-- política de escrita: o lojista não altera a numeração à mão.
create policy nfse_counters_select on public.nfse_counters
  for select to authenticated
  using (company_id = public.current_company_id() or public.is_super_admin());

-- Reserva e devolve o próximo número da oficina do usuário.
--
-- O "on conflict do update ... returning" trava a linha: chamadas
-- simultâneas entram em fila e cada uma recebe um número distinto.
create or replace function public.proximo_numero_dps()
returns bigint language plpgsql security definer set search_path = public as $fn$
declare
  empresa uuid := public.current_company_id();
  n bigint;
begin
  if empresa is null then
    raise exception 'Usuário sem oficina vinculada.';
  end if;

  insert into public.nfse_counters (company_id, ultimo_numero)
  values (empresa, 1)
  on conflict (company_id) do update
    set ultimo_numero = public.nfse_counters.ultimo_numero + 1,
        updated_date = now()
  returning ultimo_numero into n;

  return n;
end $fn$;

revoke execute on function public.proximo_numero_dps() from anon;
grant execute on function public.proximo_numero_dps() to authenticated;

create trigger nfse_counters_touch before update on public.nfse_counters
  for each row execute function public.touch_updated_date();

-- Uma nota é identificada pela chave de acesso devolvida pelo governo.
-- O índice impede gravar a mesma nota duas vezes se o registro for repetido
-- (por exemplo, se a tela reenviar o resultado depois de uma queda de rede).
create unique index nfe_records_chave_idx
  on public.nfe_records (company_id, number)
  where model = 'nfse' and number is not null;
