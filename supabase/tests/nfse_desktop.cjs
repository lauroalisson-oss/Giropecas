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

const cert=require('../../desktop/nfse/certificado.js');
const sefin=require('../../desktop/nfse/sefin.js');

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
ok(/PRIVATE KEY/.test(c.credencial.key) && /BEGIN CERTIFICATE/.test(c.credencial.cert),'carrega chave e certificado sem pedir nada');
ok(!('senha' in c) && !('pfx' in c),'a senha e o .pfx nao saem do modulo do certificado');
ok(c.info.privateKeyPem.includes('PRIVATE KEY'),'chave disponivel para assinar');

console.log('--- Cifra de outra maquina (certificado copiado) ---');
fs.writeFileSync(path.join(tmp,'certificado','senha.bin'),Buffer.from('OUTRA-MAQUINA:senha123'));
ok(cert.situacao().senhaGuardada===false,'senha de outra maquina e ignorada');
try{ cert.carregar(); ok(false,'deveria exigir a senha'); }
catch(e){ ok(/Senha do certificado nao disponivel|não disponível/i.test(e.message),'pede a senha em vez de falhar feio'); }
ok(/PRIVATE KEY/.test(cert.carregar('senha123').credencial.key),'aceita a senha digitada na hora');

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
// "/API/SefinNacional/docs" e a pagina da documentacao; a API responde em
// /SefinNacional nos dois ambientes. Com /API, homologacao dava 404.
ok(sefin.CAMINHOS.homologacao==='/SefinNacional/nfse','homologacao no mesmo caminho da producao (sem /API)');

console.log('--- Resposta do Sefin ---');
const {gzipSync}=require('zlib');
const resp=(status,json)=>sefin.interpretar({status,json,texto:json?JSON.stringify(json):''});
// Formato real da recusa: campos com inicial MAIUSCULA. Lido em minuscula,
// a mensagem chegava VAZIA a tela.
const recusa=resp(400,{tipoAmbiente:2,versaoAplicativo:'x',dataHoraProcessamento:'2026-10-02T10:00:00-03:00',
  erros:[{Codigo:'E0004',Descricao:'Tipo de inscricao invalido',Complemento:'infDPS/Id'},{Codigo:'E0121',Descricao:'xNome nao permitido'}]});
ok(!recusa.ok,'recusa nao e sucesso');
ok(/E0004 Tipo de inscricao invalido \(infDPS\/Id\)/.test(recusa.erro),`mensagem com codigo, descricao e complemento (deu "${recusa.erro}")`);
ok(/E0121/.test(recusa.erro)&&recusa.erro.includes(' | '),'todos os erros, separados');
ok(recusa.codigos.join()==='E0004,E0121','codigos para diagnostico');
ok(resp(400,{erros:[{codigo:'E0714',descricao:'Assinatura invalida'}]}).erro==='E0714 Assinatura invalida','formato antigo (minuscula) continua lido');
ok(resp(400,{erro:[{Codigo:'E1235',Descricao:'Falha no schema'}]}).codigos[0]==='E1235','lista em "erro" (singular)');
ok(resp(404,{codigo:'404',mensagem:'Nao encontrado'}).erro==='Nao encontrado','erro simples com mensagem');
ok(resp(500,null).erro==='HTTP 500','sem corpo: o status');
ok(sefin.interpretar({status:502,json:null,texto:'<html>Bad Gateway</html>'}).erro.includes('Bad Gateway'),'corpo nao-JSON aparece');

const xml='<NFSe><infNFSe Id="NFS1"/></NFSe>';
const autorizada=resp(201,{chaveAcesso:'1'.repeat(50),idDps:'DPS1',nfseXmlGZipB64:gzipSync(Buffer.from(xml)).toString('base64')});
ok(autorizada.ok&&autorizada.chaveAcesso==='1'.repeat(50),'autorizada: chave de acesso');
ok(autorizada.xmlNfse===xml,'autorizada: XML da nota descompactado');

console.log('--- Resposta de evento (cancelamento) ---');
ok(resp(201,{retEvento:{cStat:144,xMotivo:'Evento registrado',idEvento:'EVT1'}}).ok,'cStat 144: registrado');
const evRecusado=resp(200,{retEvento:{cStat:840,xMotivo:'NFS-e ja cancelada'}});
ok(!evRecusado.ok&&/840 NFS-e ja cancelada/.test(evRecusado.erro),'outro cStat com HTTP 200 e recusa, com o motivo');
ok(resp(204,null).ok,'204 sem corpo: aceito');

console.log('--- DANFSe (PDF) ---');
ok(sefin.HOSTS_ADN.producao==='adn.nfse.gov.br'&&sefin.HOSTS_ADN.homologacao==='adn.producaorestrita.nfse.gov.br','DANFSe vem do Ambiente Nacional (ADN)');
const pdf=Buffer.from('%PDF-1.7\n...');
const dan=(status,bruto,json=null)=>sefin.interpretarDanfse({status,bruto,json,texto:bruto?bruto.toString('utf8'):''});
ok(dan(200,pdf).ok&&dan(200,pdf).pdf===pdf,'PDF valido: devolve os bytes');
ok(!dan(200,Buffer.from('<html>erro</html>')).ok,'200 que nao e PDF: erro, nao arquivo corrompido');
ok(/indisponível/.test(dan(503,Buffer.from('')).erro)&&/XML da nota já vale/.test(dan(503,Buffer.from('')).erro),'ADN fora do ar: explica, e lembra que o XML vale');
ok(/indisponível/.test(dan(429,Buffer.from('')).erro),'limite de pedidos (429): mesma explicacao');
ok(/alguns minutos/.test(dan(404,Buffer.from('')).erro),'404: nota recem-autorizada');
ok(/E0001/.test(dan(400,Buffer.from('x'),{erros:[{Codigo:'E0001',Descricao:'Chave invalida'}]}).erro),'outro erro: lido como os demais');

console.log('--- Certificado no formato antigo (RC2-40) ---');
// Muito A1 brasileiro vem cifrado com RC2-40 (exportacao do Windows). A
// biblioteca TLS nativa recusa esse .pfx ("Unsupported PKCS12 PFX data");
// por isso a conexao com o Sefin usa a chave e a cadeia abertas pelo forge.
{
  const {execFileSync}=require('child_process'); const tls=require('tls');
  const dir=fs.mkdtempSync(path.join(require('os').tmpdir(),'giro-pfx-'));
  const sh=(args)=>execFileSync('openssl',args,{cwd:dir,stdio:'pipe'});
  let temOpenssl=true;
  try{
    fs.writeFileSync(path.join(dir,'san.cnf'),[
      '[req]','distinguished_name=dn','x509_extensions=ext','prompt=no',
      '[dn]','CN=OFICINA ANTIGA LTDA','[ext]','subjectAltName=otherName:2.16.76.1.3.3;PRINTABLESTRING:11222333000181',
    ].join('\n'));
    sh(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','k.pem','-out','c.pem','-days','30','-config','san.cnf']);
    sh(['pkcs12','-export','-legacy','-in','c.pem','-inkey','k.pem','-out','legado.pfx','-passout','pass:senha123']);
  }catch(e){ temOpenssl=false; console.log('SKIP: openssl indisponivel ('+String(e.message).split('\n')[0]+')'); }
  if(temOpenssl){
    const legado=fs.readFileSync(path.join(dir,'legado.pfx'));
    let nativoRecusa=false; try{ tls.createSecureContext({pfx:legado,passphrase:'senha123'}); }catch{ nativoRecusa=true; }
    console.log(`(TLS nativo ${nativoRecusa?'recusa':'aceita'} o .pfx antigo nesta maquina)`);
    fs.copyFileSync(path.join(dir,'legado.pfx'),path.join(tmp,'legado.pfx'));
    cert.salvar(path.join(tmp,'legado.pfx'),'senha123');
    const {credencial,info}=cert.carregar();
    let ctxOk=true; try{ tls.createSecureContext(credencial); }catch(e){ ctxOk=false; console.log('  ',e.message); }
    ok(ctxOk,'o .pfx antigo vira chave e cadeia que o TLS aceita');
    ok(/BEGIN CERTIFICATE/.test(credencial.cert)&&/PRIVATE KEY/.test(credencial.key),'credencial em PEM');
    ok(info.cnpj==='11222333000181',`CNPJ lido do nome alternativo ICP-Brasil (2.16.76.1.3.3) (deu ${info.cnpj})`);
    ok(cert.situacao().cnpj==='11222333000181','a tela do certificado mostra o CNPJ');
    cert.remover();
  }
}

console.log('--- CNPJ do certificado x CNPJ da oficina ---');
{
  const {conferirCnpj}=require('../../desktop/nfse/index.js');
  const {lerCertificado}=require('../../desktop/nfse/assinatura.js');
  const info=lerCertificado(fs.readFileSync(PFX),'senha123');
  ok(info.cnpj==='12345678000199','CNPJ lido do nome comum ("RAZAO:CNPJ")');
  const dps=(c)=>`<DPS><infDPS Id="x"><prest><CNPJ>${c}</CNPJ><IM>1</IM></prest></infDPS></DPS>`;
  let erro=null; try{ conferirCnpj(info,dps('12345678000199')); }catch(e){ erro=e; }
  ok(!erro,'mesmo CNPJ: segue');
  erro=null; try{ conferirCnpj(info,dps('11222333000181')); }catch(e){ erro=e.message; }
  ok(/12\.345\.678\/0001-99/.test(erro||'')&&/11\.222\.333\/0001-81/.test(erro||''),'CNPJ diferente: para, mostrando os dois');
  erro=null; try{ conferirCnpj({...info,cnpj:null},dps('11222333000181')); }catch(e){ erro=e; }
  ok(!erro,'certificado sem CNPJ legivel: nao bloqueia (o Sefin confere)');
}

console.log(f===0?'\n✅ MODULO DESKTOP OK':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
