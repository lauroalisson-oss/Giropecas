// Adaptador de dados: expõe a MESMA interface que o SDK do Base44 usava
// (`entities.X.filter/create/update/...`), mas falando com o Supabase.
//
// É isto que permite migrar sem reescrever as ~180 chamadas espalhadas
// pelas telas. O isolamento entre oficinas NÃO é feito aqui — é feito por
// RLS no banco, então mesmo uma consulta mal escrita não vaza dados.

import { supabase } from './supabaseClient';

// Entidade (PascalCase, como o código usa) -> tabela no Postgres.
export const TABELAS = {
  Company: 'companies',
  User: 'profiles',
  AccessKey: 'access_keys',
  Customer: 'customers',
  Vehicle: 'vehicles',
  Part: 'parts',
  Service: 'services',
  Technician: 'technicians',
  Supplier: 'suppliers',
  CardRate: 'card_rates',
  WorkOrder: 'work_orders',
  Sale: 'sales',
  NFeRecord: 'nfe_records',
  StockMovement: 'stock_movements',
  CreditTitle: 'credit_titles',
  AccountingEntry: 'accounting_entries',
  Purchase: 'purchases',
  Bill: 'bills',
  Appointment: 'appointments',
  AuditLog: 'audit_logs',
};

// O código chama order como '-created_date' (desc) ou 'name' (asc).
function aplicarOrdem(q, order) {
  if (!order) return q;
  const desc = order.startsWith('-');
  return q.order(desc ? order.slice(1) : order, { ascending: !desc });
}

// O código passa `undefined` para campos opcionais; enviar isso ao
// PostgREST sobrescreveria colunas com null sem querer.
function limpar(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function erro(e, acao, entidade) {
  if (!e) return;
  const err = new Error(e.message || `Falha ao ${acao} ${entidade}`);
  err.code = e.code;
  err.details = e.details;
  throw err;
}

function criarEntidade(nome) {
  const tabela = TABELAS[nome];
  if (!tabela) throw new Error(`Entidade desconhecida: ${nome}`);

  const api = {
    async filter(query = {}, order, limit) {
      let q = supabase.from(tabela).select('*');
      for (const [campo, valor] of Object.entries(limpar(query))) {
        q = Array.isArray(valor) ? q.in(campo, valor) : q.eq(campo, valor);
      }
      q = aplicarOrdem(q, order);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      erro(error, 'consultar', nome);
      return data || [];
    },

    async list(order, limit) {
      return api.filter({}, order, limit);
    },

    async get(id) {
      const { data, error } = await supabase.from(tabela).select('*').eq('id', id).maybeSingle();
      erro(error, 'buscar', nome);
      return data || null;
    },

    async create(dados) {
      const { data, error } = await supabase.from(tabela).insert(limpar(dados)).select().single();
      erro(error, 'criar', nome);
      return data;
    },

    async bulkCreate(linhas) {
      const { data, error } = await supabase
        .from(tabela).insert((linhas || []).map(limpar)).select();
      erro(error, 'criar em lote', nome);
      return data || [];
    },

    async update(id, patch) {
      const { data, error } = await supabase
        .from(tabela).update(limpar(patch)).eq('id', id).select().single();
      erro(error, 'atualizar', nome);
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      erro(error, 'excluir', nome);
      return true;
    },

    async deleteMany(query = {}) {
      let q = supabase.from(tabela).delete();
      const filtros = limpar(query);
      if (Object.keys(filtros).length === 0) {
        throw new Error('deleteMany exige ao menos um filtro.');
      }
      for (const [campo, valor] of Object.entries(filtros)) {
        q = Array.isArray(valor) ? q.in(campo, valor) : q.eq(campo, valor);
      }
      const { error } = await q;
      erro(error, 'excluir em lote', nome);
      return true;
    },
  };

  return api;
}

export const entities = Object.fromEntries(
  Object.keys(TABELAS).map(nome => [nome, criarEntidade(nome)]),
);
