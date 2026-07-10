# Emissão de NFC-e e NF-e no Giropeças

Este guia explica como ativar e usar a **emissão de nota fiscal** (NFC-e de balcão e NF-e) no sistema Giropeças. A integração já está pronta no código; falta apenas a **configuração** descrita aqui.

> **Aviso importante:** a emissão de nota fiscal tem efeitos legais e tributários. Os padrões de imposto que já vêm no sistema (CFOP 5102, CSOSN 102 para Simples Nacional, NCM genérico de autopeças) servem como ponto de partida e **devem ser validados com o contador** de cada oficina antes de emitir em produção.

---

## Como funciona (visão geral)

O sistema **não fala direto com a SEFAZ** (isso exigiria assinar XML, lidar com WebServices de cada estado, contingência, etc.). Em vez disso, ele usa um **gateway fiscal** — a **Focus NFe** — que cuida de toda a parte pesada. O fluxo é:

```
Giropeças  →  Backend function (guarda o token)  →  Focus NFe  →  SEFAZ
                                                        ↓
                              DANFE (PDF) + XML autorizado de volta
```

- O **token da conta Focus** fica guardado como *segredo* no servidor do Base44 — nunca aparece no navegador nem no aplicativo.
- Como **você é o provedor** (vende o acesso às oficinas), usa **uma única conta Focus**. Todas as oficinas ficam registradas **sob essa mesma conta**, identificadas pelo CNPJ.

### Multiempresas — cada oficina resolve tudo dentro do sistema

Este é o ponto central do modelo SaaS: **a oficina NÃO precisa criar conta nem acessar o painel da Focus**. Ela faz tudo dentro do Giropeças:

1. A oficina preenche os dados fiscais (IE, CSC) em **Configurações → Fiscal**.
2. A oficina **envia o próprio certificado A1 (.pfx)** e a senha, ali mesmo na tela.
3. O sistema **cadastra automaticamente** aquela empresa na sua conta Focus (via API `/v2/empresas`), enviando o certificado. Isso é feito pela função `cadastrarEmpresaFiscal`.
4. A partir daí, a oficina emite NFC-e/NF-e normalmente — tudo por CNPJ, sob o seu token de provedor.

Você (provedor) só precisa fazer **uma vez**: criar a conta Focus, pedir a habilitação da **API multiempresa** e guardar o token (passos 1–3 abaixo). Depois, cada nova oficina se auto-cadastra sozinha pelo sistema.

> O certificado e a senha trafegam do navegador → função no servidor → Focus, por HTTPS, e **não são guardados** no banco do sistema. Ficam apenas na Focus.

### O que já está implementado no código

| Parte | Onde |
|---|---|
| Cadastro da empresa no provedor (envia o certificado) | `base44/functions/cadastrarEmpresaFiscal/entry.js` |
| Função de emissão | `base44/functions/emitirNota/entry.js` |
| Função de consulta de status | `base44/functions/consultarNota/entry.js` |
| Função de cancelamento | `base44/functions/cancelarNota/entry.js` |
| Regras de payload (CFOP, NCM, pagamento) | `base44/functions/_shared/focus.js` |
| Campos fiscais da empresa | `base44/entities/Company.jsonc` |
| Tela de configuração | Configurações → **Fiscal & NF-e** |
| Botão "Emitir Nota" | Detalhe da Ordem de Serviço |
| Acompanhamento das notas | página **NF-e** |

---

## PARTE A — Configuração do provedor (você, uma vez só)

### Passo 1 — Criar a conta na Focus NFe

1. Acesse <https://focusnfe.com.br> e crie uma conta.
2. Solicite ao suporte a habilitação da **API de multiempresa** (`/v2/empresas`) — é o que permite cadastrar as oficinas automaticamente pelo sistema.
3. Pegue o seu **token de acesso** em **Painel → Alterar → Token**. Há dois: **homologação** (teste) e **produção**. Comece com o de homologação.

> Você **não** cadastra as oficinas manualmente aqui — elas se cadastram sozinhas pelo sistema (Parte B).

### Passo 2 — Guardar o token no Base44 (segredo)

Na sua máquina, na pasta do projeto, com o Base44 CLI instalado e autenticado:

```bash
# instala o CLI (uma vez)
npm install -g base44@latest
base44 login

# define o token como segredo (será lido pelas backend functions)
base44 secrets set FOCUS_NFE_TOKEN
# cole o token quando solicitado (use o de HOMOLOGAÇÃO para começar)
```

> Quando for para produção, rode o mesmo comando com o token de produção para substituir o valor.

### Passo 3 — Publicar as backend functions

```bash
base44 functions deploy cadastrarEmpresaFiscal emitirNota consultarNota cancelarNota
base44 functions list
```

---

## PARTE B — Configuração de cada oficina (dentro do sistema)

Cada oficina cliente faz isto **sozinha**, sem acessar a Focus:

### Passo 4 — Dados fiscais + certificado

1. Entre no Giropeças com a conta da oficina.
2. Em **Configurações → Empresa**: confira **CNPJ**, endereço, cidade e UF (vão para a nota).
3. Em **Configurações → Fiscal & NF-e**:
   - **Regime Tributário**.
   - **Inscrição Estadual (IE)**.
   - Ative o **Módulo Fiscal habilitado**.
   - **Ambiente da SEFAZ**: deixe em **Homologação** para testar.
   - **CSC** e **ID do CSC** (só para NFC-e — gerados grátis no portal da SEFAZ do estado).
   - Salve.
4. No cartão **Certificado Digital A1**, clique em **Selecionar arquivo .pfx**, escolha o certificado da empresa, digite a **senha** e clique em **Cadastrar empresa no provedor**.
   - O certificado A1 é comprado numa Autoridade Certificadora (Serasa, Certisign, etc.), custa ~R$ 120–200/ano.
   - Ao concluir, aparece **"Empresa cadastrada no provedor fiscal"** com a validade do certificado. Pronto para emitir.

> O arquivo do certificado e a senha vão direto para o provedor e **não ficam salvos** no sistema. Para renovar (o A1 vale 1 ano), basta enviar um novo arquivo.

---

## Passo 5 — Testar em homologação

1. Faça uma venda no **PDV** ou finalize uma **Ordem de Serviço** com pelo menos uma **peça**.
2. Na tela da OS, clique em **Emitir Nota → NFC-e (consumidor / balcão)**.
3. Vá na página **NF-e**:
   - Se aparecer **Autorizada**, deu certo — abra o **DANFE** e o **XML**.
   - Se ficar **Processando na SEFAZ**, clique em **Consultar** após alguns segundos.
   - Se aparecer **Rejeitada**, a mensagem da SEFAZ mostra o motivo (geralmente NCM, IE ou CSC incorretos). Ajuste e emita de novo.

> Notas de **homologação não têm valor fiscal** — servem só para validar o fluxo. Elas saem com a mensagem "SEM VALOR FISCAL" no DANFE. É normal.

---

## Passo 6 — Virar a chave para produção

Quando o contador validar que os impostos estão corretos:

1. Troque o segredo pelo token de produção: `base44 secrets set FOCUS_NFE_TOKEN` (cole o token de produção).
2. Em **Configurações → Fiscal**, mude o **Ambiente da SEFAZ** para **Produção** e salve.
3. Emita uma nota real de teste (valor baixo) e confirme o DANFE.

Pronto — a partir daí toda NFC-e/NF-e emitida tem valor fiscal.

---

## Tipos de nota

| Documento | Quando usar | Botão |
|---|---|---|
| **NFC-e** (modelo 65) | Venda no balcão ao consumidor final (com ou sem CPF na nota) | Emitir Nota → NFC-e |
| **NF-e** (modelo 55) | Venda para empresa/pessoa identificada, com CNPJ/CPF e endereço | Emitir Nota → NF-e |

> **Serviços / mão de obra** (NFS-e) são de competência **municipal** e não entram na NFC-e/NF-e. Por isso a emissão considera **apenas as peças** da venda ou da OS. Para emitir nota de serviço, use o sistema da prefeitura da cidade (a integração de NFS-e pode ser adicionada depois, também pela Focus).

---

## Cancelamento

Notas **autorizadas** podem ser canceladas dentro do prazo legal (NFC-e: ~30 minutos; NF-e: 24 horas, variando por estado). O cancelamento exige uma **justificativa de no mínimo 15 caracteres**. A função `cancelarNota` já está pronta para isso.

---

## Custos envolvidos (resumo)

| Item | Custo aproximado |
|---|---|
| Certificado digital A1 (por oficina/ano) | R$ 120 – 200 |
| Plano Focus NFe (por volume de notas) | a partir de ~R$ 30/mês — ver <https://focusnfe.com.br/planos> |
| CSC da NFC-e | gratuito (gerado na SEFAZ do estado) |

---

## Trocar de gateway (opcional)

O código foi escrito em cima da Focus NFe, mas a lógica de payload fica isolada em `base44/functions/_shared/focus.js`. Para usar outro provedor (PlugNotas, NFe.io, WebmaniaBR), basta adaptar esse arquivo e o segredo do token — as telas e o restante do fluxo continuam iguais.

---

## Solução de problemas

| Mensagem | Causa provável | O que fazer |
|---|---|---|
| "Integração fiscal não configurada (FOCUS_NFE_TOKEN ausente)" | Segredo não definido | Rode `base44 secrets set FOCUS_NFE_TOKEN` e faça deploy |
| "Módulo fiscal desabilitado" | Switch desligado | Ative em Configurações → Fiscal |
| "CNPJ da empresa não configurado" | Falta CNPJ | Preencha na aba Empresa |
| "Falha ao cadastrar no provedor. Verifique o certificado e a senha." | Certificado inválido ou senha errada | Reenvie o `.pfx` correto com a senha certa |
| Erro ao emitir mesmo com empresa cadastrada | Empresa não registrada no provedor | Envie o certificado em Configurações → Fiscal → Certificado Digital A1 |
| "Nenhuma mercadoria para emitir" | Venda só tem serviços | NFC-e/NF-e é para peças; serviço usa NFS-e |
| Rejeitada: "Rejeição: NCM inválido" | NCM da peça incorreto | Ajuste o NCM no cadastro da peça |
| Rejeitada: "CSC..." | CSC/ID errado na Focus | Revise o CSC no painel da Focus |
