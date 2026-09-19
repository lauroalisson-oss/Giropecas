// Simula o Electron para testar certificado.js e sefin.js fora do app.
const fs=require('fs'), path=require('path'), Module=require('module');
const tmp='/tmp/giro-desktop-teste'; fs.rmSync(tmp,{recursive:true,force:true}); fs.mkdirSync(tmp,{recursive:true});

let cifraDisponivel=true;
const electronFake={
  app:{ getPath:()=>tmp },
  safeStorage:{
    isEncryptionAvailable:()=>cifraDisponivel,
    // Simula a DPAPI: prefixo marca "cifrado nesta maquina"
    encryptString:(s)=>Buffer.from('DPAPI:'+s,'utf8'),
    decryptString:(b)=>{ const t=b.toString('utf8'); if(!t.startsWith('DPAPI:')) throw new Error('cifra de outra maquina'); return t.slice(6); },
  },
  ipcMain:{ handle:()=>{} },
};
const orig=Module._load;
Module._load=function(req,...a){ return req==='electron'?electronFake:orig.call(this,req,...a); };

const cert=require('/home/user/Giropecas/desktop/nfse/certificado.js');
const sefin=require('/home/user/Giropecas/desktop/nfse/sefin.js');

let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m)} else console.log('ok:',m) };
const PFX=require('./_cert_teste.cjs').garantir().arquivo;

console.log('--- Situacao inicial ---');
ok(cert.situacao().configurado===false,'sem certificado no inicio');
try{ cert.carregar(); ok(false,'deveria recusar sem certificado'); }
catch(e){ ok(/Nenhum certificado configurado/.test(e.message),'mensagem clara quando nao ha certificado'); }

console.log('--- Salvar ---');
try{ cert.salvar(PFX,'senha-errada'); ok(false,'senha errada deveria falhar'); }
catch(e){ ok(/senha/i.test(e.message),'senha errada e recusada ANTES de guardar'); }
ok(cert.situacao().configurado===false,'nada foi guardado apos a falha');

const r=cert.salvar(PFX,'senha123');
ok(r.senhaGuardada===true,'senha guardada com protecao do sistema');
ok(/OFICINA TESTE/.test(r.titular),'leu o titular');
ok(fs.existsSync(path.join(tmp,'certificado','certificado.pfx')),'pfx guardado na pasta local');

console.log('--- Situacao apos configurar ---');
const s=cert.situacao();
ok(s.configurado && s.senhaGuardada,'configurado e com senha');
ok(typeof s.diasParaVencer==='number','informa dias para vencer: '+s.diasParaVencer);
ok(!s.expirado,'nao esta expirado');

console.log('--- Carregar para emitir ---');
const c=cert.carregar();
ok(Buffer.isBuffer(c.pfx) && c.senha==='senha123','carrega pfx e senha sem pedir nada');
ok(c.info.privateKeyPem.includes('PRIVATE KEY'),'chave disponivel para assinar');

console.log('--- Cifra de outra maquina (certificado copiado) ---');
fs.writeFileSync(path.join(tmp,'certificado','senha.bin'),Buffer.from('OUTRA-MAQUINA:senha123'));
ok(cert.situacao().senhaGuardada===false,'senha de outra maquina e ignorada');
try{ cert.carregar(); ok(false,'deveria exigir a senha'); }
catch(e){ ok(/Senha do certificado nao disponivel|não disponível/i.test(e.message),'pede a senha em vez de falhar feio'); }
ok(cert.carregar('senha123').senha==='senha123','aceita a senha digitada na hora');

console.log('--- Sem protecao do sistema ---');
cifraDisponivel=false;
const r2=cert.salvar(PFX,'senha123');
ok(r2.senhaGuardada===false,'sem DPAPI nao guarda senha em texto puro');
ok(!fs.existsSync(path.join(tmp,'certificado','senha.bin')),'arquivo de senha removido');
cifraDisponivel=true;

console.log('--- Remover ---');
cert.remover();
ok(cert.situacao().configurado===false,'remove certificado e senha');

console.log('--- Endpoints do Sefin ---');
ok(sefin.HOSTS.homologacao.includes('producaorestrita'),'homologacao aponta para producao restrita');
ok(sefin.HOSTS.producao==='sefin.nfse.gov.br','producao aponta para o host oficial');
ok(sefin.CAMINHOS.producao.includes('/SefinNacional/nfse'),'caminho de envio correto');

console.log(f===0?'\n✅ MODULO DESKTOP OK':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
