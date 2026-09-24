// Roda todas as suítes de uma vez: `npm test`.
//
// Cada suíte é um arquivo que imprime seus casos e sai com 0 ou 1. As de
// banco (.sql) ficam de fora: precisam de um Postgres apontado.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ALIAS = path.join(AQUI, '_alias.mjs');

const suites = readdirSync(AQUI)
  .filter(f => (f.endsWith('.mjs') || f.endsWith('.cjs')) && !f.startsWith('_') && f !== 'rodar.mjs')
  .sort();

let falharam = [];
let puladas = [];

// Cada suíte roda nos DOIS fusos que importam:
//
//   America/Sao_Paulo — onde a oficina está, e onde o navegador roda;
//   UTC              — onde roda o servidor (Vercel) e esta máquina.
//
// Rodava só no fuso da máquina, que é UTC, e ali "hoje" em UTC e "hoje"
// na oficina são o mesmo dia. Uma suíte inteira de datas passava verde
// enquanto no Brasil, a partir das 21h, a venda caía no dia seguinte e o
// dia 1º do mês caía no mês anterior. Um teste que passa num fuso e falha
// no outro está dependendo do relógio da máquina — é isso que se procura.
const FUSOS = ['America/Sao_Paulo', 'UTC'];

function rodar(suite, fuso) {
  // --import resolve o atalho "@/" para as suítes que testam telas.
  const r = spawnSync(process.execPath, ['--import', ALIAS, path.join(AQUI, suite)], {
    encoding: 'utf8',
    env: { ...process.env, TZ: fuso },
  });
  return { status: r.status, saida: (r.stdout || '') + (r.stderr || '') };
}

for (const suite of suites) {
  const porFuso = FUSOS.map(fuso => ({ fuso, ...rodar(suite, fuso) }));
  // A primeira que falhar é a que se mostra; se nenhuma falhar, a primeira.
  const pior = porFuso.find(x => x.status !== 0 && x.status !== 2) || porFuso[0];
  const r = { status: pior.status };
  const saida = pior.saida;
  const fusosComFalha = porFuso.filter(x => x.status !== 0 && x.status !== 2).map(x => x.fuso);
  const falhas = (saida.match(/^FAIL:/gm) || []).length;
  const casos = (saida.match(/^ok:/gm) || []).length;

  // Código 2 = suíte de integração sem credenciais no ambiente. Não é
  // falha, mas também não pode passar despercebida: sem ela, nada do que
  // ela cobre está sendo conferido.
  if (r.status === 2) {
    puladas.push(suite);
    const motivo = (saida.match(/^PULADA: (.*)$/m) || [])[1] || 'sem credenciais';
    console.log(`⏭  ${suite.padEnd(24)} pulada — ${motivo}`);
  } else if (r.status === 0) {
    console.log(`✅ ${suite.padEnd(24)} ${casos} casos`);
  } else {
    falharam.push(suite);
    console.log(`❌ ${suite.padEnd(24)} ${falhas} falha(s) — no fuso ${fusosComFalha.join(' e ')}`);
    // Mostra só o que falhou; o resto seria ruído.
    for (const linha of saida.split('\n').filter(l => /^FAIL:|Error/.test(l))) {
      console.log(`     ${linha}`);
    }
  }
}

const passaram = suites.length - falharam.length - puladas.length;

if (falharam.length) {
  console.log(`\n❌ ${falharam.length} suíte(s) com falha: ${falharam.join(', ')}`);
} else {
  console.log(`\n✅ ${passaram} suítes passaram`);
}
if (puladas.length) {
  console.log(`⏭  ${puladas.length} pulada(s): ${puladas.join(', ')} — entram no banco como um lojista de verdade`);
  console.log('   Precisam de usuários de teste; sem eles, o login e o adaptador não são conferidos.');
}

// A RLS é conferida por supabase/tests/rls.sql, que roda no SQL Editor
// do Supabase (precisa do banco). Lembrar aqui evita que ela fique
// esquecida só porque não cabe neste runner.
console.log('\nℹ  Três conferências rodam no SQL Editor do Supabase, não aqui:');
console.log('   rls.sql          isolamento entre oficinas (cria, confere e desfaz)');
console.log('   conferencia.sql  valores guardados x origem (somente leitura)');
console.log('   permissoes.sql   permissões do banco x migrações (somente leitura)');

process.exit(falharam.length ? 1 : 0);
