-- A competência de um lançamento: o mês que ele quita, que não é o mês em
-- que o dinheiro saiu.
--
-- Nasce para a comissão do mecânico. O serviço é de setembro; o pagamento
-- costuma sair no começo de outubro. Sem guardar qual mês está sendo
-- quitado, o painel não tinha como cruzar as duas coisas:
--
--   * em setembro a comissão aparecia a pagar para sempre (o lançamento
--     não é de setembro);
--   * em outubro aparecia como saldo negativo (as OS não são de outubro).
--
-- O dono via "a pagar" num lugar e "pagou demais" no outro, para a mesma
-- comissão. É a mesma separação que Compras já faz entre receber e pagar.
--
-- Fica em accounting_entries, e não numa tabela só de comissões, porque a
-- pergunta "que mês este dinheiro quita?" vale para qualquer despesa
-- lançada com atraso — aluguel, energia, encargos.

alter table public.accounting_entries add column competencia text;

alter table public.accounting_entries add constraint accounting_entries_competencia_chk
  check (competencia is null or competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

comment on column public.accounting_entries.competencia is
  'Mês que o lançamento quita, no formato YYYY-MM. Diferente de date, que é quando o dinheiro entrou ou saiu.';

-- O painel de comissões pergunta sempre "o que já foi pago deste mecânico
-- nesta competência?".
create index accounting_entries_competencia_idx
  on public.accounting_entries (company_id, reference_type, reference_id, competencia)
  where competencia is not null;
