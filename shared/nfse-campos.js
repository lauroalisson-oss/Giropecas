// Campos digitados pelo lojista, no formato que o schema da NFS-e aceita.
//
// O Sefin valida o XML contra o XSD antes de olhar qualquer dado, e a
// recusa por schema (E1235) não diz qual campo foi — o lojista fica sem
// saber o que corrigir. Os limites abaixo são os do XSD oficial
// (supabase/tests/_xsd/tiposSimples_v1.00.xsd). Usado pela montagem da
// DPS (api/) e pelos cadastros (src/), para a regra ser uma só.

// Caracteres tipográficos que o celular e o Word inserem sozinhos e que
// ficam fora da faixa aceita pelo leiaute (Latin-1, até U+00FF).
const TROCAS = {
  '–': '-', '—': '-', '−': '-', // travessões, sinal de menos
  '‘': "'", '’': "'", '‚': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '…': '...', ' ': ' ', '•': '-', '·': '-',
  '№': 'n', // "№"
};

/**
 * Texto de uma linha no tipo TSString do leiaute: só caracteres de
 * U+0020 a U+00FF, sem espaço no começo ou no fim, até `max` caracteres.
 * O que não tem equivalente (emoji, por exemplo) sai. Devolve '' se não
 * sobrar nada — e campo vazio não vai ao XML.
 */
export function textoLeiaute(valor, max) {
  let s = String(valor ?? '').normalize('NFC');
  s = s.replace(/[–—−‘’‚′“”„″… •·№]/g, c => TROCAS[c]);
  s = s.replace(/[\t\r\n]+/g, ' ');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[^\x20-\xFF]/g, '').replace(/[\x7F-\x9F]/g, '');
  s = s.replace(/ {2,}/g, ' ').trim();
  if (max && s.length > max) s = s.slice(0, max).trim();
  return s;
}

// Telefone: só dígitos, de 6 a 20 (TSTelefone). Fora disso, não vai.
export function telefoneLeiaute(valor) {
  const d = String(valor ?? '').replace(/\D/g, '');
  return d.length >= 6 && d.length <= 20 ? d : '';
}

// E-mail: até 80 caracteres (TSEmail). Inválido ou longo, não vai — é
// opcional, e uma nota recusada por causa dele seria pior.
export function emailLeiaute(valor) {
  const s = textoLeiaute(valor);
  return s.length <= 80 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : '';
}

/**
 * Código de tributação do município (cTribMun): exatamente 3 dígitos
 * (TCCodTribMun). É o desdobramento municipal do código nacional — não é
 * o item da LC 116 ("14.01") nem o código antigo da prefeitura.
 *
 * Devolve { codigo } ('' se vazio, que é permitido) ou { erro }.
 */
export function codigoTributacaoMunicipal(valor) {
  const bruto = String(valor ?? '').trim();
  if (!bruto) return { codigo: '' };
  if (/^\d{3}$/.test(bruto)) return { codigo: bruto };
  return {
    erro: `Código de tributação do município "${bruto}" fora do padrão: a NFS-e Nacional pede 3 dígitos `
      + '(ex.: 001). Não é o item da LC 116. Se a prefeitura não passou esse código, deixe em branco.',
  };
}

/**
 * Inscrição Municipal da oficina: até 15 caracteres (TSInscMun). Com
 * pontuação passando do limite, vai só com os dígitos.
 */
export function inscricaoMunicipal(valor) {
  const s = textoLeiaute(valor);
  if (!s) return { erro: 'Inscrição Municipal não configurada (obrigatória para NFS-e).' };
  if (s.length <= 15) return { im: s };
  const d = s.replace(/\D/g, '');
  if (d && d.length <= 15) return { im: d };
  return { erro: `Inscrição Municipal "${s}" tem mais de 15 caracteres — confira o número com a prefeitura.` };
}

// Descrição do serviço: até 2000 caracteres (TSDesc2000).
export function descricaoServico(valor) {
  const s = String(valor ?? '').trim();
  return s.length > 2000 ? `${s.slice(0, 1997).trim()}...` : s;
}
