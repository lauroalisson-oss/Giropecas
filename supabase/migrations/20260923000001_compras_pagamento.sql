-- Pagamento da compra, separado do recebimento.
--
-- São dois fatos diferentes e em datas diferentes: a peça chega (entra no
-- estoque) e a compra é paga (sai do caixa). Entre um e outro podem passar
-- 30 dias.
--
-- Até aqui a compra só registrava o recebimento, e o custo não entrava no
-- caixa nunca — o relatório mostrava a receita da peça sem o custo dela.
-- Lançar o custo na data do RECEBIMENTO também estaria errado: jogaria a
-- despesa no mês errado para quem compra a prazo.
--
-- Cada oficina informa quando pagou de verdade, e é essa data que vale.
alter table public.purchases add column payment_status text default 'pendente';
alter table public.purchases add column payment_date date;
alter table public.purchases add column payment_method text;
alter table public.purchases add column invoice_number text;

alter table public.purchases add constraint purchases_payment_status_chk
  check (payment_status is null or payment_status in ('pendente', 'pago', 'cancelado'));

comment on column public.purchases.payment_date is
  'Data em que a compra foi efetivamente paga — é por ela que o custo entra no caixa.';
comment on column public.purchases.received_date is
  'Data em que as peças entraram no estoque. Não move o caixa.';
comment on column public.purchases.invoice_number is
  'NF-e do fornecedor, quando houver.';
