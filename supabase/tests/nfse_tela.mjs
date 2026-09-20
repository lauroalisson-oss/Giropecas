// A tela de notas: pendências de cadastro e o medidor do mês.
//
// O medidor tem de contar exatamente o que o servidor bloqueia. Se
// contasse diferente, o lojista veria folga onde a emissão já está barrada
// — e descobriria só na hora de emitir para o cliente.

import { pendenciasNfse, nfseNoMes } from '/home/user/Giropecas/src/lib/nfse-dados.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const completa = {
  cnpj: '12.345.678/0001-99', im: '12345',
  city_ibge_code: '2907905', iss_rate: 5,
};

console.log('--- Pendencias de cadastro ---');
ok(pendenciasNfse(completa).length === 0, 'cadastro completo nao tem pendencia');
ok(pendenciasNfse(null).length === 4, 'empresa vazia lista as 4 pendencias');
ok(pendenciasNfse({ ...completa, im: null })[0] === 'Inscrição Municipal', 'falta a IM');
ok(pendenciasNfse({ ...completa, cnpj: '' })[0] === 'CNPJ da oficina', 'falta o CNPJ');
ok(pendenciasNfse({ ...completa, iss_rate: 0 }).some(p => /Alíquota/.test(p)), 'aliquota zero e pendencia');
ok(pendenciasNfse({ ...completa, iss_rate: null }).some(p => /Alíquota/.test(p)), 'aliquota nula e pendencia');

// O codigo IBGE tem 7 digitos. Um numero curto seria outro municipio se
// alguem completasse com zeros — melhor barrar aqui.
ok(pendenciasNfse({ ...completa, city_ibge_code: '123' }).some(p => /IBGE/.test(p)),
  'IBGE com 3 digitos e pendencia');
ok(pendenciasNfse({ ...completa, city_ibge_code: '29079050' }).some(p => /IBGE/.test(p)),
  'IBGE com 8 digitos e pendencia');
ok(pendenciasNfse({ ...completa, city_ibge_code: '2907905' }).length === 0, 'IBGE de Cipo passa');
ok(pendenciasNfse({ ...completa, city_ibge_code: '2.907.905' }).length === 0,
  'IBGE digitado com pontos e aceito');
ok(pendenciasNfse({ ...completa, city_ibge_code: 2907905 }).length === 0, 'IBGE como numero e aceito');

console.log('--- Medidor do mes ---');
const HOJE = new Date('2026-09-20T10:00:00');
const nfse = (extra) => ({ model: 'nfse', status: 'autorizada', authorized_at: '2026-09-05T10:00:00', ...extra });

ok(nfseNoMes([], HOJE) === 0, 'sem notas conta zero');
ok(nfseNoMes(null, HOJE) === 0, 'lista nula conta zero');
ok(nfseNoMes([nfse(), nfse()], HOJE) === 2, 'conta as autorizadas do mes');

ok(nfseNoMes([nfse({ status: 'rejeitada' })], HOJE) === 0, 'rejeitada nao consome o limite');
ok(nfseNoMes([nfse({ status: 'validando' })], HOJE) === 0, 'presa em validando nao consome');
ok(nfseNoMes([nfse({ status: 'cancelada' })], HOJE) === 0, 'cancelada nao consome');
ok(nfseNoMes([nfse({ model: 'nfe' })], HOJE) === 0, 'NF-e de peca nao entra no limite de NFS-e');
ok(nfseNoMes([nfse({ model: 'nfce' })], HOJE) === 0, 'NFC-e nao entra no limite de NFS-e');

console.log('--- Recorte do mes ---');
ok(nfseNoMes([nfse({ authorized_at: '2026-08-31T23:59:59' })], HOJE) === 0, 'nota do mes passado nao conta');
ok(nfseNoMes([nfse({ authorized_at: '2026-09-01T00:00:00' })], HOJE) === 1, 'nota da virada do mes conta');
ok(nfseNoMes([nfse({ authorized_at: '2026-09-20T09:00:00' })], HOJE) === 1, 'nota de hoje conta');

// Sem data de autorizacao, cai para a data de criacao.
ok(nfseNoMes([nfse({ authorized_at: null, created_date: '2026-09-10T10:00:00' })], HOJE) === 1,
  'sem authorized_at usa a data de criacao');
ok(nfseNoMes([nfse({ authorized_at: null, created_date: null })], HOJE) === 0,
  'nota sem data nenhuma nao conta (nao inventa que e deste mes)');

console.log('--- Mistura realista ---');
const mistura = [
  nfse({ authorized_at: '2026-09-02T08:00:00' }),
  nfse({ authorized_at: '2026-09-18T15:00:00' }),
  nfse({ status: 'rejeitada', authorized_at: '2026-09-10T10:00:00' }),
  nfse({ authorized_at: '2026-08-20T10:00:00' }),
  nfse({ model: 'nfce', authorized_at: '2026-09-11T10:00:00' }),
];
ok(nfseNoMes(mistura, HOJE) === 2, `conta so as 2 NFS-e autorizadas de setembro (deu ${nfseNoMes(mistura, HOJE)})`);

console.log(f === 0 ? '\n✅ TELA DE NOTAS OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
