// Cada página do sistema desenha sem quebrar — nos três perfis.
//
// Nasceu de um incidente: Configurações ficou em BRANCO para todo plano
// fiscal porque um ícone era usado sem import. O build passou (não confere
// isso), o lint tinha a regra desligada, e nenhum teste desenhava telas.
//
// Aqui cada página é carregada pelo próprio Vite, como no navegador, e
// desenhada pelo React (renderToString) com o usuário, a oficina e a
// licença simulados — ver _telas/. Três perfis, porque o que aparece muda
// com eles: o selo quebrado só existia para plano fiscal.
//
// O que isto pega: erro na hora de desenhar a tela como ela abre —
// identificador inexistente, propriedade lida de algo vazio, componente que
// não renderiza. Inclusive dentro de abas (todas são desenhadas, ver
// _telas/tabs.jsx).
//
// O que NÃO pega: o que só acontece depois de carregar dados (useEffect não
// roda num desenho único) e o conteúdo de diálogos fechados.

import { createServer } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const SIM = fileURLToPath(new URL('./_telas/', import.meta.url));
const exato = (mod) => new RegExp(`^@/${mod.replace(/\//g, '\\/')}(\\.jsx?)?$`);

// Sem navegador: o mínimo que uma tela pode tocar ao desenhar. Alguns
// módulos (app-params.js) leem window.location já ao serem carregados.
const memoria = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
globalThis.window ??= globalThis;
globalThis.localStorage ??= memoria;
globalThis.sessionStorage ??= memoria;
globalThis.location ??= {
  href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:', host: 'localhost',
  hostname: 'localhost', pathname: '/', search: '', hash: '', assign() {}, replace() {}, reload() {},
};
globalThis.history ??= { replaceState() {}, pushState() {}, back() {} };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

const vite = await createServer({
  configFile: false,
  root: RAIZ,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: [
      { find: exato('api/base44Client'), replacement: path.join(SIM, 'base44Client.js') },
      { find: exato('lib/AuthContext'), replacement: path.join(SIM, 'AuthContext.jsx') },
      { find: exato('lib/CompanyContext'), replacement: path.join(SIM, 'CompanyContext.jsx') },
      { find: exato('lib/LicenseContext'), replacement: path.join(SIM, 'LicenseContext.jsx') },
      { find: exato('components/ui/tabs'), replacement: path.join(SIM, 'tabs.jsx') },
      { find: /^@\//, replacement: path.join(RAIZ, 'src') + '/' },
    ],
  },
});

const oficina = {
  id: 'c1', name: 'Oficina de Teste', cnpj: '11.222.333/0001-81', city: 'Cipó', state: 'BA',
  city_ibge_code: '2907905', iss_rate: 3, tax_regime: 'simples_nacional', nfe_environment: 'homologacao',
};
const daqui = (dias) => new Date(Date.now() + dias * 86400000).toISOString();

const PERFIS = {
  fiscal: {
    user: { id: 'u1', email: 'dono@oficina.test', company_id: 'c1', is_super_admin: false, role: 'owner' },
    company: oficina,
    licenca: {
      status: 'licensed', superAdmin: false, planType: 'fiscal', isFiscal: true, noteLimit: 100, diasRestantes: 200,
      license: { id: 'k1', status: 'active', plan_type: 'fiscal', fiscal_note_limit: 100, expires_at: daqui(200) },
    },
  },
  nao_fiscal: {
    user: { id: 'u2', email: 'dono@outra.test', company_id: 'c1', is_super_admin: false, role: 'owner' },
    company: oficina,
    licenca: {
      status: 'licensed', superAdmin: false, planType: 'non_fiscal', isFiscal: false, noteLimit: 100, diasRestantes: 4,
      license: { id: 'k2', status: 'active', plan_type: 'non_fiscal', fiscal_note_limit: null, expires_at: daqui(4) },
    },
  },
  provedor: {
    user: { id: 'u0', email: 'provedor@giro.test', company_id: null, is_super_admin: true, role: 'owner' },
    company: oficina,
    companies: [oficina],
    licenca: { status: 'licensed', superAdmin: true, planType: 'fiscal', isFiscal: true, noteLimit: Infinity, diasRestantes: null, license: null },
  },
};

const paginas = readdirSync(path.join(RAIZ, 'src/pages')).filter(a => a.endsWith('.jsx')).sort();
ok(paginas.length >= 25, `achou as páginas (${paginas.length})`);

// Avisos do React (chave faltando etc.) não derrubam a tela; ficam de fora
// para a saída mostrar só o que importa.
const erroOriginal = console.error;
console.error = () => {};

for (const [nome, perfil] of Object.entries(PERFIS)) {
  console.log(`--- perfil: ${nome} ---`);
  globalThis.__PERFIL_TELA = perfil;
  for (const arq of paginas) {
    let html = '';
    let erro = null;
    try {
      const mod = await vite.ssrLoadModule(path.join(RAIZ, 'src/pages', arq));
      const Pagina = mod.default;
      if (typeof Pagina !== 'function') throw new Error('a página não exporta um componente');
      html = renderToString(
        React.createElement(QueryClientProvider, { client: new QueryClient() },
          React.createElement(MemoryRouter, null, React.createElement(Pagina))),
      );
    } catch (e) {
      erro = e;
    }
    // Desenhar vazio é permitido: é o que faz uma tela que redireciona
    // (Login para quem já entrou) ou que não é para este perfil (Admin
    // Provedor para a oficina). Quebrar, não.
    ok(!erro, `${arq} desenha${erro ? ` — ${String(erro.message || erro).split('\n')[0]}` : (html.length ? '' : ' (vazia: redireciona ou não é deste perfil)')}`);
  }
}

console.error = erroOriginal;
await vite.close();

console.log(f === 0 ? '\n✅ TODAS AS TELAS DESENHAM' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
