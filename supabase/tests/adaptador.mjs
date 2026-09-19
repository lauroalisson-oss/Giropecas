import { createClient } from '/home/user/Giropecas/node_modules/@supabase/supabase-js/dist/index.mjs';

const URL='https://boxolsxxlslqnehptomb.supabase.co';
const KEY='sb_publishable_gE98QS8CEYY4cCtNvADSGQ_4U6hIXPp';
const supabase = createClient(URL, KEY, { auth:{ persistSession:false } });

// --- replica da lógica do adaptador (src/api/entities.js) ---
const TABELAS={Company:'companies',User:'profiles',AccessKey:'access_keys',Customer:'customers',
 Vehicle:'vehicles',Part:'parts',Service:'services',WorkOrder:'work_orders',Sale:'sales'};
const limpar=o=>Object.fromEntries(Object.entries(o||{}).filter(([,v])=>v!==undefined));
const ordem=(q,o)=>!o?q:q.order(o.startsWith('-')?o.slice(1):o,{ascending:!o.startsWith('-')});
const erro=(e,a,n)=>{ if(e){const x=new Error(e.message||`Falha ao ${a} ${n}`);x.code=e.code;throw x;} };
function ent(n){ const t=TABELAS[n]; const api={
  async filter(q={},o,l){ let b=supabase.from(t).select('*');
    for(const [c,v] of Object.entries(limpar(q))) b=Array.isArray(v)?b.in(c,v):b.eq(c,v);
    b=ordem(b,o); if(l) b=b.limit(l); const {data,error}=await b; erro(error,'consultar',n); return data||[]; },
  async list(o,l){ return api.filter({},o,l); },
  async get(id){ const {data,error}=await supabase.from(t).select('*').eq('id',id).maybeSingle(); erro(error,'buscar',n); return data||null; },
  async create(d){ const {data,error}=await supabase.from(t).insert(limpar(d)).select().single(); erro(error,'criar',n); return data; },
  async update(id,p){ const {data,error}=await supabase.from(t).update(limpar(p)).eq('id',id).select().single(); erro(error,'atualizar',n); return data; },
  async delete(id){ const {error}=await supabase.from(t).delete().eq('id',id); erro(error,'excluir',n); return true; },
}; return api; }
const entities=Object.fromEntries(Object.keys(TABELAS).map(n=>[n,ent(n)]));

let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m);} else console.log('ok:',m); };
const CO='33333333-3333-3333-3333-333333333333';

// 1) SEM login, a RLS precisa bloquear
let r = await entities.Customer.filter({});
ok(r.length===0, `sem login nao le clientes (leu ${r.length})`);
try { await entities.Customer.create({company_id:CO,name:'Invasor Anonimo'}); ok(false,'sem login NAO deveria inserir'); }
catch { ok(true,'sem login nao insere'); }

// 2) Login
const { data:auth, error:aerr } = await supabase.auth.signInWithPassword({
  email:'teste.adaptador@giropecas.local', password:'SenhaTeste123!' });
ok(!aerr && !!auth?.user, 'login com email/senha funciona' + (aerr?` (${aerr.message})`:''));

// 3) create / get / filter / update / delete com sessao
const novo = await entities.Customer.create({ company_id:CO, name:'Cliente Adaptador', phone:'75999998888' });
ok(!!novo?.id, 'create devolve a linha criada');
ok(!!novo?.created_date, 'created_date preenchido (ordenacao das telas depende disso)');

const achado = await entities.Customer.get(novo.id);
ok(achado?.name==='Cliente Adaptador', 'get por id');

const lista = await entities.Customer.filter({ company_id:CO }, '-created_date');
ok(lista.length>=1, `filter com company_id + ordem (${lista.length})`);

const alterado = await entities.Customer.update(novo.id, { phone:'75911112222', notes:undefined });
ok(alterado?.phone==='75911112222', 'update aplica a mudanca');
ok(alterado?.notes===null||alterado?.notes===undefined, 'undefined nao sobrescreve campo');

// 4) campos jsonb (itens de OS)
const os = await entities.WorkOrder.create({ company_id:CO, customer_id:novo.id, order_number:'00001',
  parts_items:[{part_id:'x',description:'Filtro',quantity:2,unit_price:10,total_price:20}], total:20 });
ok(Array.isArray(os?.parts_items) && os.parts_items[0].description==='Filtro', 'array jsonb ida e volta');

// 5) isolamento: tentar criar em OUTRA empresa
try { await entities.Customer.create({ company_id:'11111111-1111-1111-1111-111111111111', name:'Vazou' });
  ok(false,'RLS deveria bloquear insercao em outra empresa'); }
catch { ok(true,'RLS bloqueia insercao em outra empresa'); }

// 6) limpeza
await entities.WorkOrder.delete(os.id);
await entities.Customer.delete(novo.id);
ok((await entities.Customer.get(novo.id))===null, 'delete remove de fato');

await supabase.auth.signOut();
console.log(f===0?'\n✅ ADAPTADOR OK CONTRA O SUPABASE REAL':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
