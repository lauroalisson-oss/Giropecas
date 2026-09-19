// Replica a selecao de empresa do CompanyContext
function selecionar({ ehProvedor, visiveis, salvo }){
  if (visiveis.length === 0) return null;
  const encontrado = salvo ? visiveis.find(c=>c.id===salvo) : null;
  if (ehProvedor) return encontrado || null;   // provedor NAO entra sozinho
  return encontrado || visiveis[0];            // lojista tem uma so
}
let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m)} else console.log('ok:',m) };
const A={id:'a',name:'RR MOTOPECAS'}, B={id:'b',name:'Oficina Cipo'};

// O BUG que voce encontrou
ok(selecionar({ehProvedor:true,visiveis:[A,B],salvo:null})===null,
   'provedor NAO cai dentro de oficina automaticamente (era o bug)');
ok(selecionar({ehProvedor:true,visiveis:[A],salvo:null})===null,
   'nem quando existe so uma oficina');

// Provedor entra de proposito
ok(selecionar({ehProvedor:true,visiveis:[A,B],salvo:'b'})===B,
   'provedor entra na oficina que escolheu');
ok(selecionar({ehProvedor:true,visiveis:[A,B],salvo:'zzz'})===null,
   'escolha invalida nao vira entrada acidental');

// Lojista
ok(selecionar({ehProvedor:false,visiveis:[A],salvo:null})===A,
   'lojista entra direto na propria oficina');
ok(selecionar({ehProvedor:false,visiveis:[A],salvo:'b'})===A,
   'lojista ignora selecao invalida e usa a dele');

// Sem empresas
ok(selecionar({ehProvedor:true,visiveis:[],salvo:null})===null,'provedor sem oficinas');
ok(selecionar({ehProvedor:false,visiveis:[],salvo:null})===null,'lojista sem oficina');

console.log(f===0?'\n✅ ESCOPO DE EMPRESA OK':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
