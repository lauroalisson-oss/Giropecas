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

for (const suite of suites) {
  // --import resolve o atalho "@/" para as suítes que testam telas.
  const r = spawnSync(process.execPath, ['--import', ALIAS, path.join(AQUI, suite)], {
    encoding: 'utf8',
  });
  const saida = (r.stdout || '') + (r.stderr || '');
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
    console.log(`❌ ${suite.padEnd(24)} ${falhas} falha(s)`);
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
  console.log(`⏭  ${puladas.length} pulada(s): ${puladas.join(', ')} — testam o banco de verdade`);
  console.log('   Enquanto estiverem puladas, RLS e adaptador não estão sendo conferidos.');
}

process.exit(falharam.length ? 1 : 0);
