import { montarDps, codigoTributacaoNacional, descricaoCTribNac, dataHoraComFuso } from '/home/user/Giropecas/api/_lib/nfse-dps.js';
import { DOMParser } from '/home/user/Giropecas/node_modules/@xmldom/xmldom/lib/index.js';
import TABELA from '/home/user/Giropecas/shared/ctribnac.json' with { type: 'json' };

let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m)} else console.log('ok:',m) };
const tag=(xml,n)=>{ const m=xml.match(new RegExp(`<${n}>([^<]*)</${n}>`)); return m?m[1]:null; };

// Dados reais informados: Cipo-BA = 2907905, ISS 5% no item 14.01
const empresa={ cnpj:'12.345.678/0001-99', im:'12345', city_ibge_code:'2907905',
  tax_regime:'simples_nacional', iss_rate:5 };
const oleo={ id:'s1', name:'Troca de oleo', service_code_lc116:'14.01', iss_rate:5 };
const servicos=[{ description:'Troca de oleo', hours:1, total_price:150, servico:oleo }];

console.log('--- Estrutura ---');
const r=montarDps({empresa,cliente:null,servicos,numero:1,serie:'1',producao:false});
ok(r.xml.startsWith('<?xml'),'declaracao XML');
ok(r.id.length===45,'Id com 45 caracteres');
ok(tag(r.xml,'tpAmb')==='2','homologacao = tpAmb 2');
ok(tag(r.xml,'cLocEmi')==='2907905','municipio de Cipo');
ok(tag(r.xml,'vServ')==='150.00','valor com 2 casas e ponto decimal');
ok(tag(r.xml,'pAliq')==='5.00','aliquota 5%');
ok(r.iss===7.5,`ISS calculado (deu ${r.iss}, esperado 7.5)`);
ok(tag(r.xml,'serie')==='00001','serie com 5 digitos');

console.log('--- XML bem formado ---');
let erro=null;
new DOMParser({onError:(l,m)=>{if(l!=='warning')erro=m}}).parseFromString(r.xml,'text/xml');
ok(!erro,'XML valido'+(erro?': '+erro:''));

console.log('--- Armadilhas conhecidas ---');
ok(!/<prest>[\s\S]*?<xNome>/.test(r.xml),'E0121: prestador NAO leva xNome com tpEmit=1');
ok(r.xml.includes('<pTotTribSN>'),'E0712: Simples usa pTotTribSN');
const normal=montarDps({empresa:{...empresa,tax_regime:'lucro_presumido'},servicos,numero:1});
ok(normal.xml.includes('<indTotTrib>'),'E0712: regime normal usa indTotTrib');
ok(!normal.xml.includes('pTotTribSN'),'regime normal nao usa o do Simples');
ok(r.id[10]==='2','E0004: tipo de inscricao 2 = CNPJ');

console.log('--- Ordem dos elementos (XSD valida sequencia) ---');
const ordem=['tpAmb','dhEmi','verAplic','serie','nDPS','dCompet','tpEmit','cLocEmi'];
let pos=-1,ordemOk=true;
for(const t of ordem){ const p=r.xml.indexOf(`<${t}>`); if(p<pos)ordemOk=false; pos=p; }
ok(ordemOk,'elementos de infDPS na ordem do layout');
ok(r.xml.indexOf('<prest>')<r.xml.indexOf('<serv>'),'prest antes de serv');
ok(r.xml.indexOf('<serv>')<r.xml.indexOf('<valores>'),'serv antes de valores');

console.log('--- Tomador ---');
const comCpf=montarDps({empresa,cliente:{tax_id:'529.982.247-25',name:'Ana Silva',phone:'75988887777'},servicos,numero:2});
ok(comCpf.xml.includes('<CPF>52998224725</CPF>'),'tomador pessoa fisica usa CPF');
ok(comCpf.xml.includes('<xNome>Ana Silva</xNome>'),'tomador leva nome (diferente do prestador)');
const comCnpj=montarDps({empresa,cliente:{tax_id:'11.222.333/0001-81',name:'Transportes ME'},servicos,numero:3});
ok(comCnpj.xml.includes('<CNPJ>11222333000181</CNPJ>'),'tomador pessoa juridica usa CNPJ');
ok(!montarDps({empresa,cliente:{name:'Sem documento'},servicos,numero:4}).xml.includes('<toma>'),'sem documento nao monta tomador');

console.log('--- Caracteres especiais (quebrariam o XML) ---');
const especial=montarDps({empresa,servicos:[{description:'Troca de oleo & filtro <padrao>',hours:1,total_price:100,servico:oleo}],numero:5});
ok(especial.xml.includes('&amp;') && especial.xml.includes('&lt;'),'escapa & e <');
let e2=null; new DOMParser({onError:(l,m)=>{if(l!=='warning')e2=m}}).parseFromString(especial.xml,'text/xml');
ok(!e2,'XML com caractere especial continua valido');

console.log('--- Varios servicos ---');
const multi=montarDps({empresa,servicos:[
  {description:'Troca de oleo',hours:1,total_price:150,servico:oleo},
  {description:'Revisao freios',hours:2,total_price:200,servico:{...oleo,id:'s2'}}],numero:6});
ok(tag(multi.xml,'vServ')==='350.00','soma os servicos');
ok(/Troca de oleo \(1h\) \| Revisao freios \(2h\)/.test(multi.xml),'descricao lista cada servico');

console.log('--- Recusas ---');
const recusa=(fn,oque)=>{ try{fn();ok(false,oque+' deveria falhar')}catch{ok(true,oque+' e recusado')} };
recusa(()=>montarDps({empresa:{...empresa,im:null},servicos,numero:7}),'sem Inscricao Municipal');
recusa(()=>montarDps({empresa:{...empresa,cnpj:null},servicos,numero:8}),'sem CNPJ');
recusa(()=>montarDps({empresa:{...empresa,iss_rate:0},servicos:[{description:'x',total_price:10,servico:{}}],numero:9}),'sem aliquota de ISS');
recusa(()=>montarDps({empresa,servicos:[],numero:10}),'OS sem servicos');
recusa(()=>montarDps({empresa:{...empresa,city_ibge_code:'123'},servicos,numero:11}),'municipio invalido');

console.log('--- Fuso em dhEmi ---');
ok(/[+-]\d{2}:\d{2}$/.test(dataHoraComFuso(new Date())),'dhEmi termina com o fuso');

console.log('--- Codigo de tributacao nacional (tabela oficial) ---');
// Derivar completando com '00' (14.01 -> 140100) dava codigo INEXISTENTE nos
// 338 casos: toda nota seria rejeitada. Agora e consulta na tabela oficial.
ok(codigoTributacaoNacional('14.01')==='140101','item 14.01 -> 140101 (conserto de veiculos)');
ok(tag(r.xml,'cTribNac')==='140101','cTribNac da DPS sai da tabela oficial');
ok(descricaoCTribNac('140101').includes('conserto'),'codigo tem descricao na tabela');
ok(codigoTributacaoNacional('140101')==='140101','codigo de 6 digitos e aceito direto');
ok(descricaoCTribNac('140100')===null,'140100 (o antigo derivado) nao existe');
recusa(()=>codigoTributacaoNacional('140100'),'codigo inexistente');
recusa(()=>codigoTributacaoNacional('10.01'),'item com varios desdobros (pede o codigo de 6 digitos)');
recusa(()=>codigoTributacaoNacional('99.99'),'item que nao existe na LC 116');
recusa(()=>codigoTributacaoNacional(''),'codigo em branco');
// Nenhum codigo pode sair com desdobro '00': foi exatamente o erro anterior.
const todos=Object.keys(TABELA);
ok(todos.length===338,`tabela com 338 codigos (tem ${todos.length})`);
ok(todos.every(c=>codigoTributacaoNacional(c)===c),'todos os 338 codigos da tabela sao aceitos');
ok(!todos.some(c=>c.endsWith('00')),'nenhum codigo oficial termina em 00');

console.log(f===0?'\n✅ GERADOR DA DPS OK':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
