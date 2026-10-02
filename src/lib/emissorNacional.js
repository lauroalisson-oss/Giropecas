// Aviso de município que não emite pelo Emissor Nacional.
//
// A tabela (~90 KB) só é carregada quando uma tela fiscal pede — não pesa
// no carregamento do sistema para quem não emite nota.
import { useEffect, useState } from 'react';
import { avisoEmissorNacional } from '../../shared/emissor-nacional.js';

let tabelaEmCache = null;

export function useAvisoEmissorNacional(empresa) {
  const [tabela, setTabela] = useState(tabelaEmCache);
  useEffect(() => {
    if (tabelaEmCache || !empresa?.city) return;
    let vivo = true;
    import('../../shared/emissor-nacional.json')
      .then((m) => { tabelaEmCache = m.default || m; if (vivo) setTabela(tabelaEmCache); })
      .catch(() => { /* sem a tabela, sem aviso — a emissão continua possível */ });
    return () => { vivo = false; };
  }, [empresa?.city]);
  return avisoEmissorNacional(empresa, tabela);
}
