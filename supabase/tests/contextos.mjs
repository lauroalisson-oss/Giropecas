// Contextos de empresa e licença, contra o banco de verdade.
//
// Suíte de INTEGRAÇÃO: precisa de usuários de teste no Supabase. As senhas
// vêm do ambiente — nunca do arquivo. Senha de acesso real gravada no
// repositório vale para todo mundo que enxerga o repositório, inclusive
// depois de trocada no histórico do git.
//
// Como rodar:
//   GIRO_TESTE_VALIDA=... GIRO_TESTE_VENCIDA=... GIRO_TESTE_ADMIN=... npm test

const SENHAS = {
  valida: process.env.GIRO_TESTE_VALIDA,
  vencida: process.env.GIRO_TESTE_VENCIDA,
  admin: process.env.GIRO_TESTE_ADMIN,
};

if (!SENHAS.valida || !SENHAS.vencida || !SENHAS.admin) {
  console.log('PULADA: faltam as senhas dos usuários de teste no ambiente.');
  console.log('        Defina GIRO_TESTE_VALIDA, GIRO_TESTE_VENCIDA e GIRO_TESTE_ADMIN.');
  process.exit(2);
}

import { createClient } from '/home/user/Giropecas/node_modules/@supabase/supabase-js/dist/index.mjs';
const novo = () => createClient('https://boxolsxxlslqnehptomb.supabase.co',
  'sb_publishable_gE98QS8CEYY4cCtNvADSGQ_4U6hIXPp', { auth:{ persistSession:false } });

let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m);} else console.log('ok:',m); };
const isExpired = d => !!d && new Date(d).getTime() < Date.now();

// Replica o que LicenseContext e CompanyContext fazem
async function contextos(sb, email){
  const keys = await sb.from('access_keys').select('*').eq('activated_by', email).order('expires_at',{ascending:false});
  const chaves = keys.data || [];
  const ativa = chaves.find(k=>k.status==='active') || chaves[0] || null;
  let status='unlicensed';
  if (ativa){
    if (ativa.status==='revoked') status='expired';
    else if (isExpired(ativa.expires_at)) status='expired';
    else status = ativa.status==='active' ? 'licensed' : 'unlicensed';
  }
  const comps = await sb.from('companies').select('*').order('name');
  const planType = ativa?.plan_type || 'non_fiscal';
  return { status, license:ativa, companies:comps.data||[], planType,
           noteLimit: ativa?.fiscal_note_limit || 100, isFiscal: planType==='fiscal' };
}

// --- Oficina com licença válida ---
let sb = novo();
let { error } = await sb.auth.signInWithPassword({email:'valida@teste.local',password:SENHAS.valida});
ok(!error,'login oficina valida'+(error?` (${error.message})`:''));
let c = await contextos(sb,'valida@teste.local');
ok(c.status==='licensed', `status licensed (veio ${c.status})`);
ok(c.companies.length===1, `ve APENAS a propria oficina (viu ${c.companies.length})`);
ok(c.companies[0]?.name==='Oficina Valida','a oficina certa');
ok(c.isFiscal===true,'plano fiscal vindo da licenca');
ok(c.noteLimit===150,`limite 150 da licenca (veio ${c.noteLimit})`);
const cli = await sb.from('customers').select('name');
ok(cli.data?.length===1 && cli.data[0].name==='Cliente da Valida','ve apenas os proprios clientes');
await sb.auth.signOut();

// --- Oficina com licença vencida ---
sb = novo();
({ error } = await sb.auth.signInWithPassword({email:'vencida@teste.local',password:SENHAS.vencida}));
ok(!error,'login oficina vencida'+(error?` (${error.message})`:''));
c = await contextos(sb,'vencida@teste.local');
ok(c.status==='expired', `status expired -> acesso bloqueado (veio ${c.status})`);
ok(c.isFiscal===false,'plano nao-fiscal');
ok(c.companies.length===1 && c.companies[0].name==='Oficina Vencida','ve so a propria oficina');
// mesmo vencida, nao pode ver a outra
const outra = await sb.from('customers').select('name').eq('company_id','aaaa1111-0000-0000-0000-000000000001');
ok((outra.data||[]).length===0,'nao acessa dados da outra oficina');
await sb.auth.signOut();

// --- Super-admin ---
sb = novo();
({ error } = await sb.auth.signInWithPassword({email:process.env.GIRO_TESTE_ADMIN_EMAIL || 'lauro.alisson@gmail.com',password:SENHAS.admin}));
ok(!error,'login super-admin'+(error?` (${error.message})`:''));
const comps = await sb.from('companies').select('*');
ok((comps.data||[]).length>=2, `super-admin ve todas as oficinas (viu ${comps.data?.length})`);
const todasChaves = await sb.from('access_keys').select('*');
ok((todasChaves.data||[]).length>=2,'super-admin ve todas as licencas');
await sb.auth.signOut();

console.log(f===0?'\n✅ CONTEXTOS VALIDADOS CONTRA O SUPABASE':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
