// Licença: renovação, limite de notas e dias restantes.
//
// Esta suíte REESCREVIA a fórmula da renovação em vez de chamá-la — uma
// cópia da conta do painel, colada aqui. Passava verde com a tela errada,
// que é o pior tipo de teste: dá a sensação de cobertura sem cobrir nada.
// Agora importa de src/lib/license.js, a mesma origem que a tela usa.

import {
  renovarLicenca, limiteDeNotas, daysRemaining, isExpired, LIMITE_PADRAO_NOTAS,
} from '/home/user/Giropecas/src/lib/license.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const DIA = 86400000;
const AGORA = Date.parse('2026-09-23T12:00:00Z');
const emDias = n => new Date(AGORA + n * DIA).toISOString();
const dias = iso => Math.round((Date.parse(iso) - AGORA) / DIA);

console.log('--- Renovacao: vencida conta do zero ---');
// Somar 30 dias a um vencimento de 10 dias atrás entregaria 20 dias de
// acesso por um mês pago.
let r = renovarLicenca({ status: 'active', expires_at: emDias(-10) }, 30, AGORA);
ok(r.vencida === true, 'reconhece a licenca vencida pela data');
ok(dias(r.expires_at) === 30, `conta a partir de hoje (deu ${dias(r.expires_at)}d, esperado 30)`);
ok(r.status === 'active', 'renovar reativa o acesso');
ok(r.duration_days === 30, 'guarda a duracao contratada');

console.log('--- Renovacao: em dia soma ao que resta ---');
// O contrário também custa: zerar o prazo restante cobraria de novo por
// dias que a oficina já pagou.
r = renovarLicenca({ status: 'active', expires_at: emDias(20) }, 30, AGORA);
ok(r.vencida === false, 'reconhece a licenca em dia');
ok(dias(r.expires_at) === 50, `soma ao prazo (deu ${dias(r.expires_at)}d, esperado 50)`);

console.log('--- Renovacao: casos de borda ---');
r = renovarLicenca({ status: 'expired', expires_at: emDias(5) }, 15, AGORA);
ok(r.vencida === true, "status 'expired' prevalece sobre uma data futura");
ok(dias(r.expires_at) === 15, 'e conta do zero');

// Revogada NAO e vencida: o bloqueio foi do provedor, o prazo seguiu
// correndo. Religar tem de devolver os dias ja pagos.
r = renovarLicenca({ status: 'revoked', expires_at: emDias(20) }, 30, AGORA);
ok(dias(r.expires_at) === 50, `revogada em dia mantem o saldo (deu ${dias(r.expires_at)}d)`);

r = renovarLicenca({ status: 'active', expires_at: null }, 30, AGORA);
ok(r.vencida === true && dias(r.expires_at) === 30, 'licenca sem vencimento conta do zero');

let lancou = false;
try { renovarLicenca({ expires_at: emDias(10) }, 0, AGORA); } catch { lancou = true; }
ok(lancou, 'renovar por 0 dias e recusado, nao grava vencimento igual');
lancou = false;
try { renovarLicenca({ expires_at: emDias(10) }, 'trinta', AGORA); } catch { lancou = true; }
ok(lancou, 'duracao que nao e numero e recusada, nao vira Invalid Date');

console.log('--- Limite de notas: zero e zero ---');
// `Number(x) || 100` estava em quatro lugares e transformava 0 em 100:
// um plano sem emissao liberava cem notas.
ok(limiteDeNotas(0) === 0, 'limite 0 continua 0');
ok(limiteDeNotas('0') === 0, 'o formulario devolve string; 0 continua 0');
ok(limiteDeNotas(150) === 150, 'limite contratado e respeitado');
ok(limiteDeNotas('150') === 150, 'string vira numero');
ok(limiteDeNotas(null) === LIMITE_PADRAO_NOTAS, 'sem limite definido, vale o padrao');
ok(limiteDeNotas(undefined) === LIMITE_PADRAO_NOTAS, 'indefinido vale o padrao');
ok(limiteDeNotas('') === LIMITE_PADRAO_NOTAS, 'vazio vale o padrao');
ok(limiteDeNotas('abc') === LIMITE_PADRAO_NOTAS, 'lixo vale o padrao, nao NaN');
ok(limiteDeNotas(-5) === LIMITE_PADRAO_NOTAS, 'negativo nao e limite, vale o padrao');

console.log('--- Dias restantes: uma conta so no sistema inteiro ---');
// O contexto arredondava para CIMA e o menu para BAIXO: a mesma licenca
// mostrava 8 dias num canto e 7 no outro.
const daqui = n => new Date(Date.now() + n * DIA).toISOString();
ok(daysRemaining(daqui(7.5)) === 7, 'sete dias e meio mostra 7, nao 8');
ok(daysRemaining(daqui(-3)) === 0, 'vencida nao mostra dias negativos');
ok(daysRemaining(null) === 0, 'sem data, zero');
ok(daysRemaining(daqui(0.2)) === 0, 'vence hoje: zero dias restantes');

console.log('--- isExpired ---');
ok(isExpired(daqui(-1)) === true, 'ontem venceu');
ok(isExpired(daqui(1)) === false, 'amanha nao venceu');
ok(isExpired(null) === true, 'sem vencimento, tratada como vencida');

console.log(f === 0 ? '\n✅ LICENCA OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
