// O que o código grava num lançamento de caixa x o que o banco aceita.
//
// A suíte de comissões tinha 57 casos verdes e o botão "Pagar comissão"
// falhava em TODO clique em produção: o lançamento levava
// reference_type = 'commission', e a regra do banco só aceitava 'sale',
// 'payment', 'purchase', 'manual' e 'tax'. As suítes testavam a função que
// monta o lançamento; ninguém olhava para o banco que o recebe.
//
// Esta suíte não precisa de banco: lê a regra direto das migrações. O
// permissoes.sql confere a mesma lista contra o banco de verdade — as
// migrações também já divergiram do banco uma vez.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  REFERENCIAS_LANCAMENTO, lancamentosDaVenda, estornoDaVenda,
} from '/home/user/Giropecas/src/lib/caixa.js';
import { lancamentoPagamentoCompra } from '/home/user/Giropecas/src/lib/compras.js';
import { lancamentoComissao } from '/home/user/Giropecas/src/lib/comissoes.js';
import {
  TIPOS_MOVIMENTO, REFERENCIAS_MOVIMENTO, devolucaoDeEstoque,
} from '/home/user/Giropecas/src/lib/estoque.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const RAIZ = '/home/user/Giropecas';
const MIGRACOES = path.join(RAIZ, 'supabase/migrations');

// A lista aceita pela ÚLTIMA migração (em ordem de nome) que define a
// regra `nome`. Serve para qualquer check do tipo `coluna in (...)`.
function valoresDaRegra(nome, ate = null) {
  const arquivos = readdirSync(MIGRACOES).filter(a => a.endsWith('.sql')).sort()
    .filter(a => !ate || a <= ate);
  let aceitos = null;
  const re = new RegExp(`${nome}\\s+check\\s*\\(([\\s\\S]*?)\\)\\s*\\)\\s*;`, 'gi');
  for (const a of arquivos) {
    const sql = readFileSync(path.join(MIGRACOES, a), 'utf8');
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(sql))) aceitos = [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
  }
  return aceitos;
}
const tiposAceitos = (ate) => valoresDaRegra('accounting_entries_reference_type_chk', ate);

// Todo valor literal de `campo` escrito à mão dentro de
// `<Entidade>.create(...)` nas telas — os que não passam pela lib.
function valoresNasTelas(entidade, campo) {
  const achados = [];
  const chamada = `${entidade}.create(`;
  const re = new RegExp(`\\b${campo}:\\s*'([a-z_]+)'`, 'g');
  const andar = (dir) => {
    for (const nome of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, nome.name);
      if (nome.isDirectory()) andar(p);
      else if (/\.(jsx?|mjs)$/.test(nome.name)) {
        const src = readFileSync(p, 'utf8');
        let i = -1;
        while ((i = src.indexOf(chamada, i + 1)) >= 0) {
          const trecho = src.slice(i, i + 900);
          const fim = trecho.indexOf('});');
          const bloco = fim > 0 ? trecho.slice(0, fim) : trecho;
          for (const m of bloco.matchAll(re)) achados.push({ arquivo: path.relative(RAIZ, p), valor: m[1] });
        }
      }
    }
  };
  andar(path.join(RAIZ, 'src'));
  return achados;
}
const tiposNasTelas = () => valoresNasTelas('AccountingEntry', 'reference_type')
  .map(({ arquivo, valor }) => ({ arquivo, tipo: valor }));

console.log('--- A regra do banco, lida das migracoes ---');
const aceitos = tiposAceitos();
ok(Array.isArray(aceitos) && aceitos.length > 0, `achou a regra (${(aceitos || []).join(', ')})`);

for (const t of REFERENCIAS_LANCAMENTO) {
  ok(aceitos.includes(t), `o banco aceita '${t}'`);
}

console.log('--- O que as funcoes da lib gravam ---');
const gravados = [
  ...lancamentosDaVenda({ total: 100, pagamentos: [{ method: 'cartao_credito', amount: 100 }], taxas: 3, saleId: 'v' }).lancamentos,
  lancamentoPagamentoCompra({ compra: { id: 'c', total: 50 }, data: '2026-09-25' }),
  lancamentoComissao({ tecnico: { id: 't' }, valor: 10, competencia: '2026-09' }),
  ...estornoDaVenda({
    venda: { id: 'v' },
    lancamentos: [{ type: 'credit', reference_type: 'sale', reference_id: 'v', amount: 100 }],
  }).lancamentos,
];
ok(gravados.length >= 5, `montou os lancamentos de todas as funcoes (${gravados.length})`);
for (const l of gravados) {
  ok(REFERENCIAS_LANCAMENTO.includes(l.reference_type),
    `'${l.reference_type}' (${l.category || l.description}) esta no vocabulario`);
  ok(aceitos.includes(l.reference_type), `e o banco aceita '${l.reference_type}'`);
}

console.log('--- O que as telas gravam direto ---');
const telas = tiposNasTelas();
ok(telas.length > 0, `achou lancamentos escritos a mao nas telas (${telas.length})`);
for (const { arquivo, tipo } of telas) {
  ok(aceitos.includes(tipo), `${arquivo}: o banco aceita '${tipo}'`);
}

console.log('--- Movimentos de estoque x banco ---');
// A devolucao gravava reference_type = 'estorno', que o banco recusa. Como
// o saldo da peca era somado ANTES do movimento, cada tentativa de cancelar
// uma OS paga inflava o estoque e o cancelamento nunca concluia.
const tiposMov = valoresDaRegra('stock_movements_type_chk');
const refsMov = valoresDaRegra('stock_movements_reference_type_chk');
ok(tiposMov && refsMov, `achou as regras (${(tiposMov || []).join('/')} | ${(refsMov || []).join('/')})`);
for (const t of TIPOS_MOVIMENTO) ok(tiposMov.includes(t), `o banco aceita movimento type '${t}'`);
for (const r of REFERENCIAS_MOVIMENTO) ok(refsMov.includes(r), `o banco aceita movimento reference_type '${r}'`);

const saidas = [{ part_id: 'p', type: 'saida', quantity: 2 }];
for (const referenceType of ['work_order', 'sale']) {
  const [passo] = devolucaoDeEstoque({ movimentos: saidas, estoqueAtual: { p: 1 }, referenceId: 'x', referenceType });
  ok(tiposMov.includes(passo.movimento.type), `devolucao (${referenceType}): type '${passo.movimento.type}' aceito`);
  ok(refsMov.includes(passo.movimento.reference_type), `devolucao (${referenceType}): reference_type aceito`);
}
let recusou = false;
try { devolucaoDeEstoque({ movimentos: saidas, referenceId: 'x', referenceType: 'estorno' }); } catch { recusou = true; }
ok(recusou, "a funcao recusa 'estorno' antes de chegar ao banco");

for (const { arquivo, valor } of valoresNasTelas('StockMovement', 'type')) {
  ok(tiposMov.includes(valor), `${arquivo}: movimento type '${valor}' aceito`);
}
for (const { arquivo, valor } of valoresNasTelas('StockMovement', 'reference_type')) {
  ok(refsMov.includes(valor), `${arquivo}: movimento reference_type '${valor}' aceito`);
}

console.log('--- A prova: com a regra antiga, esta suite teria acusado ---');
// Regra como estava antes de 20260925000001. 'commission' ficava de fora.
const antiga = tiposAceitos('20260924999999');
ok(antiga && !antiga.includes('commission'), 'a regra antiga nao aceitava commission');
ok(gravados.some(l => l.reference_type === 'commission' && !antiga.includes(l.reference_type)),
  'e a comissao gravava justamente commission — a suite teria falhado');

console.log(f === 0 ? '\n✅ LANCAMENTOS x BANCO OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
