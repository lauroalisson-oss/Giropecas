-- Endereço do cliente completo, para ir na NFS-e.
--
-- A nota só leva o endereço do tomador se ele estiver completo: município
-- (código IBGE), CEP, logradouro, número e bairro — os três últimos são
-- 1-1 no leiaute nacional. O cadastro tinha só "endereço" (rua e número
-- juntos), cidade, UF e CEP, e a nota saía sem endereço
-- (api/_lib/nfse-dps.js, enderecoDoTomador).
--
-- O código IBGE não é digitado: sai do CEP (ViaCEP), na tela. Digitado à
-- mão é fácil de errar — 48420-000 é Antas, 48450-000 é Cipó.

alter table public.customers add column if not exists address_number text;
alter table public.customers add column if not exists neighborhood text;
alter table public.customers add column if not exists address_complement text;
alter table public.customers add column if not exists city_ibge_code text;

alter table public.customers add constraint customers_city_ibge_code_chk
  check (city_ibge_code is null or city_ibge_code ~ '^[0-9]{7}$');
