# Giropeças — Instalador para Windows

Esta pasta gera o **instalador Windows** (`Giropecas-Setup-1.0.0.exe`). O instalador pode ser copiado para um pendrive e instalado em qualquer máquina Windows.

## Os dois modos

Na primeira abertura o aplicativo pergunta como este computador vai trabalhar:

| Modo | O que é | Quando usar |
|---|---|---|
| **Online** | Abre o sistema Giropeças da nuvem (o mesmo endereço do navegador) | A oficina usa o sistema online e quer **emitir NFS-e** |
| **Offline** | As telas embutidas, com dados só nesta máquina | Sem internet. Pede a **chave de acesso** gerada no painel Admin Provedor |

Para trocar depois: menu **Sistema → Trocar de modo**.

## Por que o aplicativo existe

Para emitir NFS-e, a conexão com o Sefin Nacional precisa ser autenticada com o **certificado digital A1** da oficina (mTLS). **Navegador nenhum sabe fazer isso** — não há API que dê acesso ao certificado.

Então a divisão é esta:

- o sistema na nuvem monta a nota, reserva o número e confere o plano;
- **este aplicativo** assina com o certificado e transmite ao Sefin;
- a nuvem guarda a chave de acesso e o XML que voltou.

O certificado e a senha ficam **só neste computador** (`%APPDATA%\Giropecas\certificado`), com a senha protegida pelo cofre do Windows (DPAPI). Não são enviados ao sistema nem ao provedor — é isso que mantém a responsabilidade da nota com a oficina.

No modo online, **só o endereço configurado** pode pedir uma assinatura. Qualquer outro link abre no navegador do sistema, fora do aplicativo.

Configure o certificado em **Configurações → Fiscal**, dentro do aplicativo.

## Como gerar o instalador (passo a passo, no Windows)

1. **Instale o Node.js** (uma única vez, na sua máquina):
   - Baixe em <https://nodejs.org/pt-br> (versão LTS, arquivo `.msi`) e instale clicando em "Avançar" até o fim.

2. **Baixe o projeto** nesta máquina (via Git ou baixando o ZIP do repositório no GitHub e extraindo).

3. **Abra o PowerShell na pasta `desktop`** do projeto:
   - No Explorador de Arquivos, entre na pasta `desktop`, clique na barra de endereço, digite `powershell` e pressione Enter.

4. **Execute o script de build:**

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\build-installer.ps1
   ```

   A primeira execução demora alguns minutos (baixa o Electron). Ao final, a pasta `dist` abre automaticamente com o arquivo:

   ```
   Giropecas-Setup-1.0.0.exe
   ```

5. **Copie o `.exe` para o pendrive** e instale na máquina que quiser (dois cliques → escolher pasta → instalar). Um atalho "Giropecas" é criado na área de trabalho e no menu Iniciar.

> Alternativa sem script: na pasta `desktop`, rode `npm install` e depois `npm run dist`.
>
> Versão **portátil** (roda direto do pendrive, sem instalar): `npm run dist:portable` → gera `Giropecas-Portatil-1.0.0.exe`. Atenção: na versão portátil os dados ficam gravados no perfil do usuário da máquina onde o app for executado, não no pendrive.

## Como funciona a licença

- Ao abrir pela primeira vez, o app mostra a tela **"Ativação necessária"**.
- Gere a chave no sistema online (**Admin Provedor**) informando o nome do cliente e o período (3, 5, 15, 30, 90 dias, 6 meses ou 1 ano) e envie o código ao cliente.
- A **data de vencimento está embutida na chave** (conta a partir da geração) e é validada localmente, **sem precisar de internet**.
- Ao vencer, o aplicativo bloqueia e pede uma nova chave. Os dados do cliente **não são perdidos** — voltam a aparecer assim que uma nova chave é ativada.
- Uma chave vencida ou já usada no dispositivo não reativa.

## Onde ficam os dados

Os dados (clientes, peças, ordens, vendas) ficam no perfil do usuário do Windows, em
`%APPDATA%\Giropecas`. Use **Configurações → Backup** dentro do app para exportar/importar um arquivo `.json`.

## Testar sem empacotar

```powershell
npm install
npm start
```
