// FUNCTION DE DIAGNÓSTICO — TEMPORÁRIA.
//
// Não emite nada. Serve para responder uma única pergunta antes de investirmos
// na integração direta com o Sistema Nacional NFS-e:
//
//   o runtime de functions do Base44 consegue fazer o que a API exige?
//
// A emissão direta (POST /SefinNacional/nfse) exige quatro capacidades:
//   1. mTLS  — autenticar com certificado ICP-Brasil do cliente no handshake TLS
//   2. PKCS#12 — ler o .pfx da oficina para extrair chave privada e certificado
//   3. XMLDSig — assinar a DPS com RSA-SHA256
//   4. GZip + Base64 — compactar o XML assinado
//
// Se (1) falhar, a integração direta é inviável neste runtime e não adianta
// escrever mais nada. Apague esta function depois do diagnóstico.
//
// Uso: base44.functions.invoke('nfseProbe', {})

Deno.serve(async (req) => {
  const resultado = {};
  const registrar = async (nome, fn) => {
    try {
      resultado[nome] = { ok: true, detalhe: await fn() };
    } catch (e) {
      resultado[nome] = { ok: false, erro: `${e?.name || 'Erro'}: ${e?.message || e}` };
    }
  };

  // --- 1. mTLS: a capacidade decisiva -------------------------------------
  // No Deno, certificado de cliente exige Deno.createHttpClient({ cert, key }).
  // Se a API não existir (ou estiver bloqueada por permissão), não há mTLS.
  await registrar('mtls_api_existe', () => {
    const tipo = typeof Deno?.createHttpClient;
    if (tipo !== 'function') throw new Error(`Deno.createHttpClient é "${tipo}", não function`);
    return 'Deno.createHttpClient disponível';
  });

  // Criar o client com um par cert/key inválido: esperamos um erro de PARSE do
  // certificado (bom sinal — a opção é aceita), não "unknown option"/"not supported".
  await registrar('mtls_aceita_cert', () => {
    const client = Deno.createHttpClient({
      cert: '-----BEGIN CERTIFICATE-----\nteste\n-----END CERTIFICATE-----\n',
      key: '-----BEGIN PRIVATE KEY-----\nteste\n-----END PRIVATE KEY-----\n',
    });
    try { client.close?.(); } catch { /* ignore */ }
    return 'opções cert/key aceitas (client criado)';
  });

  // --- 2. PKCS#12: ler o .pfx da oficina ----------------------------------
  // Web Crypto não abre .pfx; precisa de biblioteca. Testamos o import.
  await registrar('pkcs12_node_forge', async () => {
    const forge = await import('npm:node-forge@1.3.1');
    const api = forge.default || forge;
    if (!api?.pkcs12) throw new Error('node-forge importado, mas sem módulo pkcs12');
    return 'node-forge disponível com pkcs12';
  });

  // --- 3. Assinatura RSA-SHA256 (base do XMLDSig) -------------------------
  await registrar('assinatura_rsa_sha256', async () => {
    const par = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify'],
    );
    const dados = new TextEncoder().encode('<DPS>teste</DPS>');
    const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, dados);
    const valida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', par.publicKey, assinatura, dados);
    if (!valida) throw new Error('assinatura gerada não confere na verificação');
    return `assinatura RSA-SHA256 OK (${assinatura.byteLength} bytes)`;
  });

  // --- 4. GZip + Base64 ---------------------------------------------------
  await registrar('gzip_base64', async () => {
    if (typeof CompressionStream !== 'function') throw new Error('CompressionStream indisponível');
    const entrada = new Blob([new TextEncoder().encode('<DPS>teste de compactacao</DPS>')]);
    const fluxo = entrada.stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(fluxo).arrayBuffer());
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return `gzip+base64 OK (${btoa(bin).length} chars)`;
  });

  // --- 5. Saída de rede até o Sefin Nacional ------------------------------
  // GET na documentação (inofensivo). Só confirma que o host é alcançável a
  // partir do runtime — não emite nem envia nada.
  await registrar('egress_sefin', async () => {
    const r = await fetch('https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/index', {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });
    return `host alcançável (HTTP ${r.status})`;
  });

  const viavel = resultado.mtls_api_existe?.ok && resultado.mtls_aceita_cert?.ok;

  return Response.json({
    veredito: viavel
      ? 'VIÁVEL: o runtime aceita certificado de cliente (mTLS). Integração direta pode seguir.'
      : 'INVIÁVEL: o runtime não oferece mTLS. A emissão direta no Sefin Nacional não é possível daqui.',
    integracao_direta_possivel: !!viavel,
    resultado,
  });
});
