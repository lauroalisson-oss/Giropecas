-- Tipos de referência aceitos num lançamento de caixa.
--
-- A regra original aceitava 'sale', 'payment', 'purchase', 'manual' e
-- 'tax'. A migração de comissões (20260924000002) passou a gravar
-- 'commission' — e ninguém conferiu contra esta regra. Resultado: em
-- produção, TODO clique em "Pagar comissão" falhava com violação de
-- check constraint. As 57 verificações da suíte de comissões passavam,
-- porque testavam a função que monta o lançamento, não o banco que o
-- recebe.
--
-- Entra junto 'refund': o estorno de uma OS paga que foi cancelada. O
-- lojista devolve o dinheiro ao cliente, e isso é uma saída de caixa na
-- data do cancelamento — não o apagamento da entrada original, que
-- reescreveria o caixa de um mês já fechado.
--
-- A lista de tipos vive também em src/lib/caixa.js
-- (REFERENCIAS_LANCAMENTO). A suíte lancamentos.mjs confere que as duas
-- batem, lendo esta migração; supabase/tests/permissoes.sql confere que o
-- banco de verdade aceita cada uma. Mudou aqui, muda lá.

alter table public.accounting_entries drop constraint accounting_entries_reference_type_chk;

alter table public.accounting_entries add constraint accounting_entries_reference_type_chk
  check (reference_type is null or reference_type in
    ('sale', 'payment', 'purchase', 'manual', 'tax', 'commission', 'refund'));
