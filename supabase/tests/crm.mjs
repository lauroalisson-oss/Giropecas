import { cpfValido, pendenciasCrediario, crediarioLiberado, aniversariantesDoMes, idade,
  pontuacaoCliente, faixaCliente, resumoClientes, somarMeses, proximaRevisao,
  revisoesDoVeiculo, avisoProximaRevisao } from '/home/user/Giropecas/src/lib/crm.js';

let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m)} else console.log('ok:',m) };

console.log('--- CPF e crediario ---');
ok(cpfValido('529.982.247-25'),'CPF valido com pontuacao');
ok(cpfValido('52998224725'),'CPF valido sem pontuacao');
ok(!cpfValido('111.111.111-11'),'rejeita digitos repetidos');
ok(!cpfValido('529.982.247-26'),'rejeita digito verificador errado');
ok(!cpfValido('123'),'rejeita tamanho errado');
ok(pendenciasCrediario({}).length===2,'sem CPF e sem nascimento: 2 pendencias');
ok(pendenciasCrediario({tax_id:'52998224725'}).some(p=>/nascimento/i.test(p)),'cobra data de nascimento');
ok(pendenciasCrediario({birth_date:'1990-05-10'}).some(p=>/CPF/i.test(p)),'cobra CPF');
ok(pendenciasCrediario({tax_id:'11222333000181',birth_date:'1990-05-10'}).some(p=>/CNPJ/i.test(p)),'CNPJ nao serve para crediario');
ok(crediarioLiberado({tax_id:'529.982.247-25',birth_date:'1990-05-10'}),'libera com CPF valido + nascimento');

console.log('--- Aniversariantes ---');
const cls=[{id:1,name:'Ana',birth_date:'1990-03-15'},{id:2,name:'Bruno',birth_date:'1985-03-02'},
           {id:3,name:'Carla',birth_date:'1992-07-20'},{id:4,name:'Sem data'}];
const mar=aniversariantesDoMes(cls,3);
ok(mar.length===2,`marco tem 2 (deu ${mar.length})`);
ok(mar[0].name==='Bruno','ordenado por dia (Bruno dia 2 antes de Ana dia 15)');
ok(aniversariantesDoMes(cls,12).length===0,'mes sem aniversariante');
ok(!aniversariantesDoMes(cls,3).some(c=>c.name==='Sem data'),'ignora quem nao tem data');
// fuso: data 01 do mes nao pode virar dia anterior
ok(aniversariantesDoMes([{id:9,birth_date:'1990-03-01'}],3).length===1,'dia 1 nao escorrega de mes (fuso)');
ok(idade('2000-01-01',new Date('2026-09-19'))===26,'idade calculada');
ok(idade('2000-12-31',new Date('2026-09-19'))===25,'aniversario ainda nao chegou no ano');

console.log('--- Pontuacao ---');
ok(pontuacaoCliente({totalGasto:1000,numCompras:0,numServicos:0})===100,'R$1000 = 100 pontos');
ok(pontuacaoCliente({totalGasto:0,numCompras:4,numServicos:2})===50,'4 compras + 2 servicos = 50');
ok(faixaCliente(600).nome==='Ouro' && faixaCliente(250).nome==='Prata'
  && faixaCliente(60).nome==='Bronze' && faixaCliente(10).nome==='Novo','faixas corretas');
const resumo=resumoClientes({
  clientes:[{id:'c1',name:'Ana'}],
  vendas:[{customer_id:'c1',total:300,created_date:'2026-09-01T10:00:00Z'}],
  ordens:[{customer_id:'c1',total:700,created_date:'2026-09-10T10:00:00Z'}],
  hoje:new Date('2026-09-19T12:00:00Z')});
ok(resumo[0].totalGasto===1000,'soma vendas + ordens de servico');
ok(resumo[0].numServicos===1 && resumo[0].numCompras===1,'conta compras e servicos separados');
ok(resumo[0].diasDesde===9,`dias desde a ultima visita (deu ${resumo[0].diasDesde})`);

console.log('--- Datas de manutencao ---');
ok(somarMeses(new Date('2026-01-31'),1).getDate()===28,'31/jan + 1 mes = 28/fev (nao pula para marco)');
ok(somarMeses(new Date('2024-01-31'),1).getDate()===29,'ano bissexto: 29/fev');
ok(somarMeses(new Date('2026-12-15'),6).getFullYear()===2027,'virada de ano');

console.log('--- Proxima revisao (o caso da troca de oleo) ---');
const oleo={id:'s1',name:'Troca de oleo',interval_months:6,interval_km:5000};
// feita hoje, 6 meses / 5000 km -> em dia
let r=proximaRevisao({servico:oleo,dataExecucao:'2026-09-19',kmExecucao:10000,kmAtual:10000,hoje:new Date('2026-09-19')});
ok(r.status==='em_dia','recem feita: em dia');
ok(new Date(r.vence_em).getMonth()===2,'vence em marco (6 meses depois)');
ok(r.vence_km===15000,'vence aos 15.000 km');
// 5 meses depois -> proximo (faltam ~30 dias)
r=proximaRevisao({servico:oleo,dataExecucao:'2026-03-19',kmExecucao:10000,kmAtual:11000,hoje:new Date('2026-09-01')});
ok(r.status==='proximo',`perto do prazo avisa (deu ${r.status})`);
ok(r.motivo==='tempo','avisou por tempo');
// km estourado antes do prazo
r=proximaRevisao({servico:oleo,dataExecucao:'2026-08-01',kmExecucao:10000,kmAtual:15200,hoje:new Date('2026-09-01')});
ok(r.status==='vencido' && r.motivo==='km','vence por km mesmo dentro do prazo');
// prazo estourado com pouco km
r=proximaRevisao({servico:oleo,dataExecucao:'2025-01-01',kmExecucao:10000,kmAtual:10100,hoje:new Date('2026-09-01')});
ok(r.status==='vencido' && r.motivo==='tempo','vence por tempo mesmo rodando pouco');
// servico sem intervalo nao gera cobranca
ok(proximaRevisao({servico:{id:'x',name:'Diagnostico'},dataExecucao:'2020-01-01'})===null,'servico sem intervalo nao vira aviso');
// sem km informado, usa so o tempo
r=proximaRevisao({servico:oleo,dataExecucao:'2026-09-01',kmExecucao:null,kmAtual:null,hoje:new Date('2026-09-19')});
ok(r.km_restantes===null && r.status==='em_dia','sem km nao inventa aviso');

console.log('--- Revisoes do veiculo (varias OS) ---');
const servicos={s1:oleo,s2:{id:'s2',name:'Revisao freios',interval_months:12}};
const ordens=[
  {created_date:'2026-01-10',vehicle_km:8000,service_items:[{service_id:'s1'}]},
  {created_date:'2026-08-10',vehicle_km:14000,service_items:[{service_id:'s1'},{service_id:'s2'}]},
];
const revs=revisoesDoVeiculo({ordens,servicosPorId:servicos,kmAtual:14500,hoje:new Date('2026-09-19')});
ok(revs.length===2,`duas revisoes rastreadas (deu ${revs.length})`);
const rOleo=revs.find(x=>x.servico_id==='s1');
ok(rOleo.km_execucao===14000,'usa a execucao MAIS RECENTE, nao a antiga');
ok(rOleo.vence_km===19000,'proxima aos 19.000 km');
ok(typeof avisoProximaRevisao(rOleo)==='string','gera frase para imprimir na OS');
console.log('   frase:', avisoProximaRevisao(rOleo));

console.log(f===0?'\n✅ CRM E MANUTENCAO PREVENTIVA — TODOS OS CASOS OK':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
