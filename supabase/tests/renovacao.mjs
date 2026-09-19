// Replica a lógica de renovação do painel
const isExpired = d => !!d && new Date(d).getTime() < Date.now();
function renovar(licenca, dias){
  const vencida = licenca.status==='expired' || isExpired(licenca.expires_at);
  const base = vencida ? Date.now() : new Date(licenca.expires_at).getTime();
  return { expires_at: new Date(base + dias*86400000).toISOString(), status:'active', vencida };
}
const dias = ms => Math.round((new Date(ms).getTime()-Date.now())/86400000);
let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m);} else console.log('ok:',m); };

// 1) Vencida há 10 dias, renova 30 -> deve valer 30 dias a partir de HOJE
let r = renovar({status:'active',expires_at:new Date(Date.now()-10*86400000).toISOString()},30);
ok(r.vencida===true,'detecta licenca vencida');
ok(dias(r.expires_at)===30,`vencida: conta do zero (deu ${dias(r.expires_at)}d, esperado 30)`);
ok(r.status==='active','renovacao reativa o acesso');

// 2) Válida por mais 20 dias, estende 30 -> 50 dias (nao perde o que sobrou)
r = renovar({status:'active',expires_at:new Date(Date.now()+20*86400000).toISOString()},30);
ok(r.vencida===false,'detecta licenca valida');
ok(dias(r.expires_at)===50,`valida: soma ao prazo (deu ${dias(r.expires_at)}d, esperado 50)`);

// 3) Marcada como expired mas com data futura -> trata como vencida
r = renovar({status:'expired',expires_at:new Date(Date.now()+5*86400000).toISOString()},15);
ok(r.vencida===true,'status expired prevalece sobre a data');
ok(dias(r.expires_at)===15,`conta do zero (deu ${dias(r.expires_at)}d, esperado 15)`);

// 4) Limite de notas so vale no plano fiscal
const patch = p => ({ plan_type:p, fiscal_note_limit: p==='fiscal'?150:null });
ok(patch('fiscal').fiscal_note_limit===150,'plano fiscal grava limite');
ok(patch('non_fiscal').fiscal_note_limit===null,'nao-fiscal zera o limite');

console.log(f===0?'\n✅ LOGICA DE RENOVACAO OK':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
