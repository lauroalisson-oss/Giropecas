// Endereço a partir do CEP (ViaCEP), com o código IBGE do município.
//
// O código IBGE é o que a NFS-e usa para dizer a cidade — da oficina e do
// cliente. Digitado à mão é fácil de errar e o erro não aparece: um dígito
// trocado vira outra cidade (48420-000 é Antas, 48450-000 é Cipó). Do CEP,
// ele vem certo.

export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// CEP com 8 dígitos, ou null.
export function cepValido(v) {
  const d = soDigitos(v);
  return d.length === 8 ? d : null;
}

/**
 * Lê a resposta do ViaCEP.
 * Não encontrado vem como { "erro": "true" } (texto) — ou true, em versões
 * antigas.
 */
export function interpretarViaCep(json) {
  if (!json || typeof json !== 'object') return { erro: 'Resposta inválida do serviço de CEP.' };
  if (json.erro === true || json.erro === 'true') return { erro: 'CEP não encontrado.' };
  const ibge = soDigitos(json.ibge);
  if (ibge.length !== 7) return { erro: 'O serviço de CEP não informou o município.' };
  return {
    cep: soDigitos(json.cep),
    logradouro: String(json.logradouro || '').trim(),
    bairro: String(json.bairro || '').trim(),
    cidade: String(json.localidade || '').trim(),
    uf: String(json.uf || '').trim().toUpperCase(),
    ibge,
  };
}

/**
 * Busca o CEP. Nunca lança: devolve { erro } se não der — a tela segue e a
 * pessoa digita à mão.
 */
export async function buscarCep(cep, { fetchImpl = globalThis.fetch, tempoMs = 8000 } = {}) {
  const d = cepValido(cep);
  if (!d) return { erro: 'CEP precisa ter 8 dígitos.' };
  const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const relogio = controle ? setTimeout(() => controle.abort(), tempoMs) : null;
  try {
    const r = await fetchImpl(`https://viacep.com.br/ws/${d}/json/`, controle ? { signal: controle.signal } : undefined);
    if (!r.ok) return { erro: `Serviço de CEP indisponível (${r.status}).` };
    return interpretarViaCep(await r.json());
  } catch {
    return { erro: 'Não foi possível consultar o CEP agora. Preencha à mão.' };
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

/**
 * O que preencher no formulário com o resultado do CEP.
 *
 * Cidade, UF e IBGE vêm sempre do CEP — são o que identifica o município.
 * Rua e bairro só preenchem campo VAZIO: CEP de cidade pequena vem sem rua
 * (o de Cipó é um só para a cidade toda), e apagar o que a pessoa digitou
 * seria pior do que não ajudar.
 */
export function camposDoCep(form, r, { campoRua = 'address', comBairro = true } = {}) {
  if (!r || r.erro) return {};
  const novo = { city: r.cidade, state: r.uf, city_ibge_code: r.ibge };
  if (r.logradouro && !String(form?.[campoRua] || '').trim()) novo[campoRua] = r.logradouro;
  // A empresa não tem coluna de bairro: mandar o campo faria o banco recusar
  // o salvamento. Quem não tem, pede comBairro: false.
  if (comBairro && r.bairro && !String(form?.neighborhood || '').trim()) novo.neighborhood = r.bairro;
  return novo;
}
