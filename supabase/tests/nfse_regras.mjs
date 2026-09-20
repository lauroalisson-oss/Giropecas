// As regras de quando a oficina pode emitir NFS-e.
//
// São o que o provedor combina com cada oficina — plano, limite de notas,
// validade. Valem no servidor; aqui conferimos caso a caso.

import {
  checarLicenca, checarLimiteMensal, checarOrdem, inicioDoMes,
} from '/home/user/Giropecas/api/_lib/nfse-regras.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const HOJE = new Date('2026-09-20T10:00:00-03:00');
const emDias = (n) => new Date(HOJE.getTime() + n * 86400000).toISOString();

const fiscal = {
  status: 'active', plan_type: 'fiscal',
  fiscal_note_limit: 100, expires_at: emDias(30),
};

console.log('--- Licenca ---');
ok(checarLicenca(fiscal, HOJE) === null, 'licenca fiscal ativa libera');
ok(checarLicenca(null, HOJE)?.status === 403, 'sem licenca nao emite');
ok(checarLicenca({ ...fiscal, status: 'expired' }, HOJE)?.status === 403, 'licenca expirada nao emite');
ok(checarLicenca({ ...fiscal, status: 'revoked' }, HOJE)?.status === 403, 'licenca revogada nao emite');
ok(/não inclui emissão/.test(checarLicenca({ ...fiscal, plan_type: 'non_fiscal' }, HOJE).mensagem),
  'plano nao-fiscal recebe a explicacao certa');

// A data de vencimento manda, mesmo com o status ainda "active" — o status
// só é corrigido quando alguem abre o sistema.
ok(/vencida/.test(checarLicenca({ ...fiscal, expires_at: emDias(-1) }, HOJE).mensagem),
  'vencida ontem nao emite, mesmo marcada como ativa');
ok(checarLicenca({ ...fiscal, expires_at: emDias(0.5) }, HOJE) === null, 'vence hoje mais tarde ainda emite');

console.log('--- Limite mensal ---');
ok(checarLimiteMensal(fiscal, 0) === null, 'primeira nota do mes passa');
ok(checarLimiteMensal(fiscal, 99) === null, 'a de numero 100 passa');
ok(checarLimiteMensal(fiscal, 100)?.status === 403, 'a de numero 101 e barrada');
ok(/aumentar o limite/.test(checarLimiteMensal(fiscal, 100).mensagem), 'diz o que fazer');
ok(/Limite de 100 notas/.test(checarLimiteMensal(fiscal, 100).mensagem), 'mostra o limite contratado');
ok(checarLimiteMensal({ ...fiscal, fiscal_note_limit: 500 }, 100) === null,
  'limite maior definido pelo provedor vale');
ok(checarLimiteMensal({ ...fiscal, fiscal_note_limit: null }, 99) === null,
  'sem limite gravado usa 100 (o padrao), nao infinito');
ok(checarLimiteMensal({ ...fiscal, fiscal_note_limit: null }, 100)?.status === 403,
  'o padrao de 100 realmente barra');
// Number(undefined) e NaN: uma contagem que falhou nao pode liberar tudo.
ok(checarLimiteMensal(fiscal, undefined) === null, 'contagem ausente conta como zero');

console.log('--- Ordem de servico ---');
const comServico = { id: 'os1', service_items: [{ description: 'Troca de oleo', total_price: 150 }] };
ok(checarOrdem(comServico, null) === null, 'OS com servico libera');
ok(checarOrdem(null, null)?.status === 404, 'OS inexistente da 404');
ok(checarOrdem({ id: 'os2', service_items: [] }, null)?.status === 400, 'OS sem servicos e barrada');
ok(checarOrdem({ id: 'os3', service_items: null }, null)?.status === 400, 'service_items nulo e barrado');
ok(/peças saem em NF-e/.test(checarOrdem({ id: 'os4' }, null).mensagem),
  'explica que peca e outro documento');

const jaAutorizada = { id: 'n1', number: '3529...0001', status: 'autorizada' };
const repetida = checarOrdem(comServico, jaAutorizada);
ok(repetida?.status === 409, 'OS com nota autorizada nao emite de novo');
ok(repetida.nfe_id === 'n1', 'devolve a nota existente para a tela mostrar');
ok(/3529/.test(repetida.mensagem), 'mostra a chave da nota que ja existe');

// Uma tentativa anterior que falhou NAO pode travar a oficina.
ok(checarOrdem(comServico, { id: 'n2', status: 'rejeitada' }) === null, 'apos rejeicao pode tentar de novo');
ok(checarOrdem(comServico, { id: 'n3', status: 'validando' }) === null, 'nota presa em validando nao trava');
ok(checarOrdem(comServico, { id: 'n4', status: 'cancelada' }) === null, 'apos cancelamento pode emitir outra');

console.log('--- Recorte do mes ---');
const inicio = inicioDoMes(new Date('2026-09-20T23:30:00'));
ok(inicio.getDate() === 1 && inicio.getMonth() === 8, 'volta para o dia 1 de setembro');
ok(inicio.getHours() === 0 && inicio.getMinutes() === 0 && inicio.getSeconds() === 0,
  'comeca a zero hora (nota do dia 1 de manha conta no mes)');
const virada = inicioDoMes(new Date('2026-01-31T23:59:59'));
ok(virada.getMonth() === 0 && virada.getDate() === 1, 'dia 31 continua no mes dele');

console.log(f === 0 ? '\n✅ REGRAS DE EMISSAO OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
