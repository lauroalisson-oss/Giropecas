# XSD oficiais da NFS-e Nacional (leiaute 1.00)

Schemas do Sistema Nacional NFS-e (Portal Nacional da NFS-e / Receita Federal),
usados pelo teste `nfse_xsd.mjs` para validar o XML que o GiroPeças monta: a DPS
(`api/_lib/nfse-dps.js`) e o pedido de cancelamento (`shared/nfse-evento.js`),
com e sem assinatura.

Cópia obtida em 02/10/2026 do pacote `nfelib` (akretion/nfelib,
`nfelib/nfse/schemas/v1_0`), que distribui os schemas oficiais sem alteração.

Foi validando contra eles que apareceu o Id do cancelamento com 62 caracteres
(o leiaute atual pede 59) e o `<nPedRegEvento>`, que saiu do leiaute.

Quando o Sefin publicar uma versão nova do leiaute, troque os arquivos aqui e
rode `npm test`: o que mudou aparece como falha no `nfse_xsd.mjs`.
