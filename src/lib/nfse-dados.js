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
  const xml = nota?.xml_content;
  if (!xml) return null;
  const m = xml.match(/<infDPS[^>]*\bId="(DPS[^"]+)"/);
  return m ? m[1] : null;
}
