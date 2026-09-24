// Regras de leitura das notas — sem rede e sem navegador.
//
// Separado de nfse.js de proposito: aqui fica o que decide o que o lojista
// ve (pendencias de cadastro, contagem do mes), e que precisa valer igual
// ao que o servidor bloqueia. Sendo puro, da para conferir caso a caso.

export const MODELO_LABEL = {
  nfse: 'NFS-e',
  nfe: 'NF-e',
  nfce: 'NFC-e',
};

// Dados de cadastro sem os quais o Sefin recusa a nota.
//
// Conferir aqui poupa o lojista de descobrir cada pendência uma por vez,
// pela mensagem de erro do governo.
export function pendenciasNfse(empresa) {
  const p = [];
  if (!empresa?.cnpj) p.push('CNPJ da oficina');
  if (!empresa?.im) p.push('Inscrição Municipal');

  // Exatamente 7 dígitos: completar com zero mudaria de município, e a
  // nota sairia atribuída à cidade errada em vez de falhar.
  if (!/^\d{7}$/.test(String(empresa?.city_ibge_code || '').replace(/\D/g, ''))) {
    p.push('Código IBGE do município (7 dígitos)');
  }
  if (!Number(empresa?.iss_rate)) p.push('Alíquota de ISS');
  return p;
}

// Quantas NFS-e foram autorizadas no mês corrente.
//
// Conta o MESMO que o servidor bloqueia. Se a tela contasse diferente, o
// lojista veria folga onde a emissão já está barrada.
export function nfseNoMes(notas, agora = new Date()) {
  const inicio = new Date(agora);
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);

  return (notas || []).filter((n) => {
    if (n.model !== 'nfse' || n.status !== 'autorizada') return false;
    const quando = n.authorized_at || n.created_date;
    return quando ? new Date(quando) >= inicio : false;
  }).length;
}

// Id da DPS guardado no XML do rascunho.
//
// Quando a transmissão cai no meio, é esse Id que permite perguntar ao
// Sefin se a nota existe lá (GET /dps/{id}). Sem ele, resta adivinhar.
export function idDpsDaNota(nota) {
  // Procura primeiro no campo da DPS. xml_content fica de reserva para as
  // notas gravadas antes de os dois documentos terem campos separados.
  for (const xml of [nota?.xml_dps, nota?.xml_content]) {
    if (!xml) continue;
    const m = String(xml).match(/<infDPS[^>]*\bId="(DPS[^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

// Escolhe QUAL documento baixar e com que nome.
//
// São dois documentos diferentes e os dois importam:
//   'nfse' — o que o governo devolveu; é ele que vale como nota;
//   'dps'  — a declaração assinada pela oficina, o que foi declarado.
//
// Pedindo a nota, cai para a DPS quando a nota ainda não veio (emissão em
// andamento, ou resposta do Sefin sem o XML). Pedindo a DPS, não
// substitui por outra coisa: quem pede a DPS quer a DPS.
export function escolherXml(nota, qual = 'nfse') {
  const conteudo = qual === 'dps'
    ? nota?.xml_dps
    : (nota?.xml_content || nota?.xml_dps);

  if (!conteudo) {
    throw new Error(qual === 'dps'
      ? 'Esta nota não tem a DPS guardada.'
      : 'Esta nota não tem XML guardado.');
  }

  const ehDps = conteudo === nota?.xml_dps;
  const id = nota?.number || nota?.rps_number || String(nota?.id || '').slice(-6);
  return { conteudo, nome: `${ehDps ? 'DPS' : 'NFSe'}-${id}.xml`, ehDps };
}

// A nota fiscal AUTORIZADA ligada a uma OS ou venda, se houver.
//
// Excluir o documento não cancela a nota: ela continua válida no governo,
// o ISS continua devido, e o registro dela fica apontando para uma OS que
// não existe mais. O histórico excluía assim mesmo. Quem usa esta função
// é a trava que obriga a cancelar a nota antes.
//
// Olha TODAS as notas do documento, não só a mais recente: uma nota
// rejeitada depois de uma autorizada não pode esconder a autorizada.
export function notaAutorizadaDe(notas, { workOrderId = null, saleId = null } = {}) {
  if (!workOrderId && !saleId) return null;
  return (notas || []).find(n =>
    n && n.status === 'autorizada'
    && ((workOrderId && n.work_order_id === workOrderId) || (saleId && n.sale_id === saleId)),
  ) || null;
}

// Mensagem da trava, igual em qualquer tela que tente excluir.
export function motivoNaoExcluir(nota) {
  if (!nota) return null;
  return `Este documento tem nota fiscal autorizada (nº ${nota.number || '—'}). `
    + 'Excluir não cancela a nota: ela continuaria valendo no governo e o imposto '
    + 'continuaria devido. Cancele a nota na tela de Notas Fiscais e depois exclua.';
}
