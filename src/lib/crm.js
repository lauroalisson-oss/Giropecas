// Regras de CRM e de manutenção preventiva.
//
// Ficam aqui, separadas das telas, porque são contas com casos de borda
// (mês virando ano, 29 de fevereiro, veículo sem km) e precisam ser testáveis.

// ---------------------------------------------------------------------------
// Crediário: só libera com CPF e data de nascimento.
// ---------------------------------------------------------------------------

import { vendaValida } from './caixa';

const digitos = (s) => String(s ?? '').replace(/\D/g, '');

// Valida CPF pelos dígitos verificadores. Impede o crediário de ser liberado
// com um número digitado errado ou inventado (111.111.111-11 e afins).
export function cpfValido(valor) {
  const c = digitos(valor);
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(c[i]) * (tamanho + 1 - i);
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== Number(c[tamanho])) return false;
  }
  return true;
}

// Motivos pelos quais o crediário não pode ser liberado. Lista vazia = liberado.
export function pendenciasCrediario(cliente) {
  const faltas = [];
  const doc = digitos(cliente?.tax_id);

  if (!doc) faltas.push('CPF não informado');
  else if (doc.length === 14) faltas.push('CNPJ informado — o crediário exige CPF');
  else if (!cpfValido(doc)) faltas.push('CPF inválido');

  if (!cliente?.birth_date) faltas.push('Data de nascimento não informada');

  return faltas;
}

export function crediarioLiberado(cliente) {
  return pendenciasCrediario(cliente).length === 0;
}

// ---------------------------------------------------------------------------
// Aniversariantes
// ---------------------------------------------------------------------------

// Compara só dia e mês — o ano de nascimento não importa aqui.
export function aniversariantesDoMes(clientes, mes = new Date().getMonth() + 1) {
  return (clientes || [])
    .filter(c => c.birth_date)
    .map(c => {
      // Lê como data local para não cair no dia anterior por fuso horário.
      const [ano, m, d] = String(c.birth_date).split('T')[0].split('-').map(Number);
      return { ...c, _mes: m, _dia: d, _ano: ano };
    })
    .filter(c => c._mes === mes)
    .sort((a, b) => a._dia - b._dia);
}

export function idade(birthDate, hoje = new Date()) {
  if (!birthDate) return null;
  const [a, m, d] = String(birthDate).split('T')[0].split('-').map(Number);
  let anos = hoje.getFullYear() - a;
  const mesAtual = hoje.getMonth() + 1;
  if (mesAtual < m || (mesAtual === m && hoje.getDate() < d)) anos--;
  return anos >= 0 ? anos : null;
}

// ---------------------------------------------------------------------------
// Pontuação do cliente
// ---------------------------------------------------------------------------

// Pontos por: dinheiro gasto, nº de compras no balcão e nº de serviços feitos.
// Serviço vale mais que venda avulsa porque indica vínculo com a oficina.
export const PESOS = { porReal: 1 / 10, porCompra: 5, porServico: 15 };

export function pontuacaoCliente({ totalGasto = 0, numCompras = 0, numServicos = 0 }) {
  return Math.round(
    totalGasto * PESOS.porReal +
    numCompras * PESOS.porCompra +
    numServicos * PESOS.porServico,
  );
}

export function faixaCliente(pontos) {
  if (pontos >= 500) return { nome: 'Ouro', cor: 'bg-yellow-100 text-yellow-800' };
  if (pontos >= 200) return { nome: 'Prata', cor: 'bg-slate-200 text-slate-700' };
  if (pontos >= 50) return { nome: 'Bronze', cor: 'bg-orange-100 text-orange-800' };
  return { nome: 'Novo', cor: 'bg-gray-100 text-gray-600' };
}

// Consolida vendas e ordens de serviço num resumo por cliente.
export function resumoClientes({ clientes = [], vendas = [], ordens = [], hoje = new Date() }) {
  return clientes.map(c => {
    // Venda cancelada não conta para a pontuação: o cliente recebeu o
    // dinheiro de volta.
    const vs = vendas.filter(v => v.customer_id === c.id && vendaValida(v));
    const os = ordens.filter(o => o.customer_id === c.id);

    const totalGasto =
      vs.reduce((s, v) => s + (Number(v.total) || 0), 0) +
      os.reduce((s, o) => s + (Number(o.total) || 0), 0);

    // Última vez que o cliente apareceu na loja, por venda OU por serviço.
    const datas = [...vs, ...os]
      .map(x => x.created_date)
      .filter(Boolean)
      .sort()
      .reverse();
    const ultimaVisita = datas[0] || null;
    const diasDesde = ultimaVisita
      ? Math.floor((hoje - new Date(ultimaVisita)) / 86400000)
      : null;

    const pontos = pontuacaoCliente({
      totalGasto, numCompras: vs.length, numServicos: os.length,
    });

    return {
      ...c,
      totalGasto,
      numCompras: vs.length,
      numServicos: os.length,
      ultimaVisita,
      diasDesde,
      pontos,
      faixa: faixaCliente(pontos),
    };
  });
}

// ---------------------------------------------------------------------------
// Manutenção preventiva
// ---------------------------------------------------------------------------

// Soma meses preservando o fim do mês: 31/jan + 1 mês = 28/fev, não 03/mar.
export function somarMeses(data, meses) {
  const d = new Date(data);
  const diaOriginal = d.getDate();
  d.setMonth(d.getMonth() + Number(meses));
  if (d.getDate() < diaOriginal) d.setDate(0);
  return d;
}

export const ALERTA_DIAS = 30;   // avisa 30 dias antes
export const ALERTA_KM = 500;    // ou 500 km antes

// Número de verdade ou nulo. Existe porque Number(null) === 0, e tratar
// "km não informado" como "km zero" gera avisos falsos.
function numeroOuNulo(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Para um serviço já executado num veículo, diz quando ele vence e se já
// está na hora. Vence pelo PRIMEIRO critério atingido (tempo ou km), que é
// como manutenção preventiva funciona.
export function proximaRevisao({ servico, dataExecucao, kmExecucao, kmAtual, hoje = new Date() }) {
  const meses = Number(servico?.interval_months) || 0;
  const km = Number(servico?.interval_km) || 0;
  if (!meses && !km) return null; // serviço que não se repete

  const r = {
    servico_id: servico.id,
    servico_nome: servico.name,
    vence_em: null,
    vence_km: null,
    dias_restantes: null,
    km_restantes: null,
    status: 'em_dia', // em_dia | proximo | vencido
    motivo: null,
  };

  if (meses && dataExecucao) {
    r.vence_em = somarMeses(new Date(dataExecucao), meses);
    r.dias_restantes = Math.ceil((r.vence_em - hoje) / 86400000);
  }

  // Cuidado: Number(null) é 0. Sem esta checagem, um veículo SEM km
  // registrado viraria "km 0" e ganharia um aviso inventado.
  const kmExec = numeroOuNulo(kmExecucao);
  const kmHoje = numeroOuNulo(kmAtual);
  if (km && kmExec !== null && kmHoje !== null) {
    r.vence_km = kmExec + km;
    r.km_restantes = r.vence_km - kmHoje;
  }

  const venceuTempo = r.dias_restantes !== null && r.dias_restantes <= 0;
  const venceuKm = r.km_restantes !== null && r.km_restantes <= 0;
  const pertoTempo = r.dias_restantes !== null && r.dias_restantes > 0 && r.dias_restantes <= ALERTA_DIAS;
  const pertoKm = r.km_restantes !== null && r.km_restantes > 0 && r.km_restantes <= ALERTA_KM;

  if (venceuTempo || venceuKm) {
    r.status = 'vencido';
    r.motivo = venceuTempo && venceuKm ? 'tempo e km' : (venceuTempo ? 'tempo' : 'km');
  } else if (pertoTempo || pertoKm) {
    r.status = 'proximo';
    r.motivo = pertoTempo && pertoKm ? 'tempo e km' : (pertoTempo ? 'tempo' : 'km');
  }

  return r;
}

// Varre as OS de um veículo e devolve a situação de cada serviço com
// intervalo definido, considerando sempre a execução MAIS RECENTE.
export function revisoesDoVeiculo({ ordens = [], servicosPorId = {}, kmAtual = null, hoje = new Date() }) {
  const ultimaExecucao = {}; // service_id -> { data, km }

  for (const os of ordens) {
    const data = os.closed_at || os.opened_at || os.created_date;
    if (!data) continue;
    for (const item of os.service_items || []) {
      const id = item.service_id;
      if (!id) continue;
      const anterior = ultimaExecucao[id];
      if (!anterior || new Date(data) > new Date(anterior.data)) {
        ultimaExecucao[id] = { data, km: os.vehicle_km ?? null };
      }
    }
  }

  // Sem km informado na OS mais recente, usa o maior km já registrado.
  let kmReferencia = kmAtual;
  if (kmReferencia == null) {
    const maior = Math.max(0, ...ordens.map(o => Number(o.vehicle_km) || 0));
    kmReferencia = maior > 0 ? maior : null;
  }

  const saida = [];
  for (const [servicoId, exec] of Object.entries(ultimaExecucao)) {
    const servico = servicosPorId[servicoId];
    if (!servico) continue;
    const r = proximaRevisao({
      servico,
      dataExecucao: exec.data,
      kmExecucao: exec.km,
      kmAtual: kmReferencia,
      hoje,
    });
    if (r) saida.push({ ...r, executado_em: exec.data, km_execucao: exec.km });
  }

  // Vencidos primeiro, depois os que estão perto.
  const ordem = { vencido: 0, proximo: 1, em_dia: 2 };
  return saida.sort((a, b) => ordem[a.status] - ordem[b.status]
    || (a.dias_restantes ?? 9e9) - (b.dias_restantes ?? 9e9));
}

// Frase para imprimir na OS entregue ao cliente.
export function avisoProximaRevisao(r) {
  if (!r) return null;
  const partes = [];
  if (r.vence_em) partes.push(`até ${new Date(r.vence_em).toLocaleDateString('pt-BR')}`);
  if (r.vence_km) partes.push(`ou aos ${Number(r.vence_km).toLocaleString('pt-BR')} km`);
  if (!partes.length) return null;
  return `${r.servico_nome}: próxima ${partes.join(' ')}`;
}

// Avisos de próxima revisão para IMPRIMIR na OS que o cliente leva.
//
// Olha só os serviços desta OS: é deles que nasce o próximo vencimento.
// A conta parte da data e do km do próprio atendimento — não do estado
// atual do veículo — porque o papel entregue hoje precisa dizer quando
// voltar, e essa data não muda depois.
export function revisoesDaOrdem({ ordem, servicosPorId = {} }) {
  const itens = Array.isArray(ordem?.service_items) ? ordem.service_items : [];
  const quando = ordem?.closed_at || ordem?.opened_at || ordem?.created_date;
  if (!quando) return [];

  const km = numeroOuNulo(ordem?.vehicle_km);
  const vistos = new Set();
  const avisos = [];

  for (const item of itens) {
    const servico = servicosPorId[item?.service_id];
    if (!servico || vistos.has(servico.id)) continue;
    vistos.add(servico.id);

    const r = proximaRevisao({
      servico,
      dataExecucao: quando,
      kmExecucao: km,
      // No momento da entrega, o km do atendimento é o km atual.
      kmAtual: km,
    });
    const frase = avisoProximaRevisao(r);
    if (frase) avisos.push(frase);
  }

  return avisos;
}
