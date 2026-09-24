-- Conferência: valores guardados que deveriam bater com a origem.
--
-- COMO RODAR: cole no SQL Editor do Supabase e execute. É SOMENTE
-- LEITURA — não grava, não apaga, não corrige nada. Devolve uma linha
-- por divergência encontrada, e nada quando está tudo certo.
--
-- ----------------------------------------------------------------------
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Os erros encontrados na revisão do sistema tinham todos a mesma forma:
-- um valor DERIVADO guardado numa coluna, que as telas liam como verdade
-- enquanto a origem mudava por baixo.
--
--   remaining_amount   devia ser total_amount - paid_amount
--   stock_quantity     devia ser a soma dos movimentos de estoque
--   total (OS/venda)   devia ser a soma dos itens
--   status 'vencido'   nunca era gravado, e o relatório lia zero
--
-- Cada um foi corrigido no código. Mas a forma continua: coluna guardada
-- e origem viva podem divergir de novo — por um erro novo, por uma
-- edição manual no banco, por uma gravação interrompida no meio.
--
-- Em vez de esperar a próxima divergência aparecer num fechamento de
-- mês, esta consulta pergunta ao banco se alguma já existe.
--
-- Rode depois de cada mês fechado, ou sempre que um número parecer
-- estranho. Nenhuma linha = nada divergindo.
--
-- ----------------------------------------------------------------------
-- CONFERIDO
--
-- Rodar contra um banco em ordem devolve vazio, o que só prova que a
-- consulta compila. Para provar que ela ENXERGA, foi criada uma oficina
-- de mentira com uma divergência proposital de cada tipo — saldo que não
-- bate com os movimentos, remaining_amount mentindo, parcela vencida
-- gravada como a vencer, total de OS diferente dos itens, nota sem XML,
-- compra antiga sem pagamento. As seis foram detectadas, e tudo foi
-- desfeito em seguida (nenhum resíduo ficou no banco).
-- ----------------------------------------------------------------------

with

-- 1. Saldo da peça x soma dos movimentos ------------------------------
-- O saldo é o número que a tela mostra; os movimentos são o histórico do
-- que entrou e saiu. Se discordam, um dos dois está mentindo.
estoque as (
  select
    'Estoque'                                   as area,
    c.name                                      as oficina,
    p.description                               as registro,
    'saldo ' || p.stock_quantity
      || ' x movimentos ' || coalesce(m.saldo, 0) as divergencia,
    abs(p.stock_quantity - coalesce(m.saldo, 0)) as diferenca
  from public.parts p
  join public.companies c on c.id = p.company_id
  left join (
    select part_id,
           -- Espelho de efeitoNoSaldo() em src/lib/estoque.js.
           -- O ajuste grava a diferença em módulo; o sinal sai do
           -- antes/depois. Antes contava zero, e toda peça ajustada
           -- aparecia como divergente para sempre.
           sum(case
                 when type in ('entrada', 'devolucao') then quantity
                 when type = 'saida' then -quantity
                 when type = 'ajuste' then
                   case when coalesce(new_stock, 0) - coalesce(previous_stock, 0) >= 0
                        then quantity else -quantity end
                 else 0
               end) as saldo
    from public.stock_movements
    group by part_id
  ) m on m.part_id::text = p.id::text
  -- Peça sem movimento nenhum é cadastro com saldo inicial digitado à
  -- mão: não é divergência.
  where m.saldo is not null
    and abs(p.stock_quantity - m.saldo) > 0.001
),

-- 2. Parcela: o que falta bate com total menos pago? ------------------
crediario as (
  select
    'Crediário'                                          as area,
    c.name                                               as oficina,
    'Parcela ' || coalesce(t.title_number, t.id::text)   as registro,
    'remaining_amount ' || coalesce(t.remaining_amount, 0)
      || ' x total-pago ' || (coalesce(t.total_amount, 0) - coalesce(t.paid_amount, 0)) as divergencia,
    abs(coalesce(t.remaining_amount, 0)
        - (coalesce(t.total_amount, 0) - coalesce(t.paid_amount, 0))) as diferenca
  from public.credit_titles t
  join public.companies c on c.id = t.company_id
  where t.status <> 'cancelado'
    and abs(coalesce(t.remaining_amount, 0)
            - (coalesce(t.total_amount, 0) - coalesce(t.paid_amount, 0))) > 0.01
),

-- 3. Parcela vencida ainda marcada como a vencer ----------------------
-- O status 'vencido' é calculado em memória pelas telas e nunca gravado.
-- Não é erro — mas quem ler o status direto do banco vai errar, como o
-- relatório gerencial errava.
vencidas as (
  select
    'Crediário'                                        as area,
    c.name                                             as oficina,
    'Parcela ' || coalesce(t.title_number, t.id::text) as registro,
    'vencida em ' || t.due_date || ' e gravada como ' || t.status as divergencia,
    (current_date - t.due_date)                        as diferenca
  from public.credit_titles t
  join public.companies c on c.id = t.company_id
  where t.due_date < current_date
    and t.status = 'a_vencer'
    and coalesce(t.total_amount, 0) - coalesce(t.paid_amount, 0) > 0.01
),

-- 4. Total da OS x soma dos itens -------------------------------------
ordens as (
  select
    'Ordem de serviço'                as area,
    c.name                            as oficina,
    'OS #' || coalesce(o.order_number, o.id::text) as registro,
    'total ' || coalesce(o.total, 0)
      || ' x itens-desconto ' || (itens.soma - coalesce(o.discount, 0)) as divergencia,
    abs(coalesce(o.total, 0) - (itens.soma - coalesce(o.discount, 0))) as diferenca
  from public.work_orders o
  join public.companies c on c.id = o.company_id
  cross join lateral (
    select
      coalesce((select sum((i->>'total_price')::numeric)
                from jsonb_array_elements(coalesce(o.parts_items, '[]'::jsonb)) i), 0)
      + coalesce((select sum((i->>'total_price')::numeric)
                  from jsonb_array_elements(coalesce(o.service_items, '[]'::jsonb)) i), 0)
      as soma
  ) itens
  where o.status <> 'cancelada'
    and abs(coalesce(o.total, 0) - (itens.soma - coalesce(o.discount, 0))) > 0.01
),

-- 5. Nota autorizada sem documento nenhum ------------------------------
-- Nota autorizada e sem XML deixa a oficina sem nada para o contador.
notas as (
  select
    'NFS-e'                                   as area,
    c.name                                    as oficina,
    'Nota ' || coalesce(n.number, n.id::text) as registro,
    'autorizada sem XML guardado'             as divergencia,
    0                                         as diferenca
  from public.nfe_records n
  join public.companies c on c.id = n.company_id
  where n.status = 'autorizada'
    and n.xml_content is null
    and n.xml_dps is null
),

-- 6. Compra recebida há muito tempo e ainda sem pagamento -------------
-- Não é erro: o prazo com o fornecedor é da oficina. Mas passar de 90
-- dias costuma ser lançamento esquecido, e o custo fica fora do caixa.
compras as (
  select
    'Compras'                                       as area,
    c.name                                          as oficina,
    'OC ' || coalesce(p.order_number, p.id::text)   as registro,
    'recebida em ' || p.received_date || ' e ainda sem pagamento' as divergencia,
    (current_date - p.received_date)                as diferenca
  from public.purchases p
  join public.companies c on c.id = p.company_id
  where p.status = 'recebida'
    and coalesce(p.payment_status, 'pendente') <> 'pago'
    and p.received_date is not null
    and p.received_date < current_date - interval '90 days'
)

select * from estoque
union all select * from crediario
union all select * from vencidas
union all select * from ordens
union all select * from notas
union all select * from compras
order by area, diferenca desc;
