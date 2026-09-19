// Extrai a funcao cardCertificado do app.js e executa com stubs.
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync('/home/user/Giropecas/offline-app/app.js','utf8');
const ini=src.indexOf('function cardCertificado()');
const fim=src.indexOf('// Busca a situação e redesenha');
if(ini<0||fim<0){ console.log('FAIL: funcao nao encontrada'); process.exit(1); }

let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m)} else console.log('ok:',m) };

function render(desktop, info){
  const ctx={ esc:(s)=>String(s).replace(/</g,'&lt;'),
    dateBR:(d)=>d?new Date(d).toLocaleDateString('pt-BR'):'—',
    _certInfo:info, window:{} };
  if(desktop) ctx.window.giropecasNFSe={disponivel:true};
  vm.runInNewContext(src.slice(ini,fim)+'\n__r=cardCertificado();',ctx,{timeout:3000});
  return ctx.__r;
}

console.log('--- Navegador: nao pode emitir ---');
let h=render(false,null);
ok(/aplicativo instalado no computador/.test(h),'explica por que so emite no app instalado');
ok(!/Configurar certificado/.test(h),'nao oferece botao inutil no navegador');

console.log('--- Desktop: sem certificado ---');
h=render(true,{configurado:false});
ok(/Nenhum certificado configurado/.test(h),'avisa que falta configurar');
ok(/Configurar certificado/.test(h),'oferece o botao');
ok(/\.pfx/.test(h),'diz qual arquivo enviar');

console.log('--- Desktop: certificado valido ---');
h=render(true,{configurado:true,senhaGuardada:true,titular:'C=BR, O=OFICINA TESTE LTDA',
  validoAte:new Date(Date.now()+200*864e5),expirado:false,diasParaVencer:200});
ok(/OFICINA TESTE LTDA/.test(h),'mostra o titular');
ok(/senha guardada com seguran/.test(h),'informa que a senha esta protegida');
ok(/Trocar certificado/.test(h) && /Remover/.test(h),'oferece trocar e remover');
ok(!/VENCIDO/.test(h),'sem alerta indevido');

console.log('--- Desktop: vencendo em breve ---');
h=render(true,{configurado:true,senhaGuardada:true,validoAte:new Date(Date.now()+10*864e5),expirado:false,diasParaVencer:10});
ok(/Vence em 10 dia/.test(h),'avisa com antecedencia');

console.log('--- Desktop: VENCIDO ---');
h=render(true,{configurado:true,senhaGuardada:true,validoAte:new Date(Date.now()-5*864e5),expirado:true,diasParaVencer:-5});
ok(/VENCIDO/.test(h),'alerta de vencido em destaque');

console.log('--- Desktop: sem protecao do sistema ---');
h=render(true,{configurado:true,senhaGuardada:false,titular:'X',validoAte:new Date(Date.now()+100*864e5),expirado:false,diasParaVencer:100});
ok(/pedida a cada emiss/.test(h),'avisa que a senha sera pedida sempre');

console.log('--- Sempre deixa claro onde o certificado fica ---');
for(const caso of [{configurado:false},{configurado:true,senhaGuardada:true,diasParaVencer:100,validoAte:new Date()}]){
  const x=render(true,caso);
  if(!/somente neste computador/.test(x)){ f++; console.log('FAIL: falta o aviso de privacidade'); }
}
ok(true,'aviso "somente neste computador" em todos os estados');

console.log('--- HTML integro ---');
h=render(true,{configurado:true,senhaGuardada:true,titular:'T',validoAte:new Date(),expirado:false,diasParaVencer:50});
ok((h.match(/<div/g)||[]).length===(h.match(/<\/div>/g)||[]).length,'divs equilibradas');
ok(h.startsWith('<div class="card">') && h.endsWith('</div>'),'card bem formado');

console.log(f===0?'\n✅ CARD DO CERTIFICADO OK':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
