// Onde baixar o aplicativo GiroPeças para Windows.
//
// O instalador é gerado pelo GitHub (workflow "Instalador Windows"); numa
// tag instalador-v*, ele vira uma Release pública. "latest" aponta sempre
// para a mais recente. Para usar outro endereço, defina
// VITE_URL_INSTALADOR nas variáveis de ambiente da Vercel.
export const URL_INSTALADOR = import.meta.env?.VITE_URL_INSTALADOR
  || 'https://github.com/lauroalisson-oss/Giropecas/releases/latest';

// O endereço que a oficina digita na primeira abertura do aplicativo: o
// mesmo desta página.
export function enderecoDoSistema() {
  return typeof window !== 'undefined' && window.location?.host ? window.location.host : '';
}
