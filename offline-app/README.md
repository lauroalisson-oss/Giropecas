# Giropeças Offline

Aplicativo **100% offline** do Giropeças. Todos os dados (clientes, peças, ordens de serviço e vendas) ficam salvos no próprio dispositivo (`localStorage`), sem depender de internet ou servidor.

> **Instalador para Windows:** veja a pasta [`desktop/`](../desktop/README.md) — ela gera o `Giropecas-Setup.exe` para instalar este aplicativo em qualquer máquina via pendrive.

## Chave de acesso (licença)

O aplicativo **exige uma chave de acesso** para funcionar — a mesma lógica do sistema online:

- As chaves são criadas **exclusivamente pelo super-admin** (`lauro.alisson@gmail.com`) na página **Admin Provedor** do sistema online, informando o nome do cliente e o período.
- Formato: `GIRO-XXXX-XXXX-XXXX`. A validação é feita localmente (checksum e **data de vencimento embutidos na chave**), portanto **não precisa de internet** para ativar.
- Durações disponíveis: **3, 5, 15, 30, 90 dias, 6 meses ou 1 ano**. O prazo conta a partir da **geração da chave** — o mesmo vencimento acompanhado no painel Admin Provedor.
- Ao vencer, o app bloqueia até que uma nova chave seja informada (os dados não são perdidos).
- Uma chave vencida ou já utilizada **não pode ser reativada no mesmo dispositivo**.

## Como usar

### Opção 1 — Abrir direto no navegador

Basta abrir o arquivo `index.html` em um navegador moderno (Chrome, Edge, Firefox).

### Opção 2 — Instalar como aplicativo (PWA, recomendado)

Sirva a pasta por um servidor local e instale como app:

```bash
# com Node.js instalado:
npx serve offline-app
# ou com Python:
python3 -m http.server 8080 --directory offline-app
```

Abra o endereço indicado (ex.: `http://localhost:8080`) e use a opção **"Instalar aplicativo"** do navegador. Depois de instalado, o app abre em janela própria e funciona **sem internet** (o service worker mantém tudo em cache).

## Funcionalidades

- **Dashboard** — vendas do dia, OS em aberto, alertas de estoque baixo
- **Clientes** — cadastro completo com veículo
- **Peças & Estoque** — preços, custo, controle de estoque mínimo
- **Ordens de Serviço** — fluxo aberta → em andamento → concluída, com peças e mão de obra; ao concluir dá baixa no estoque e registra a venda
- **PDV Rápido** — venda balcão com carrinho e baixa automática de estoque
- **Vendas** — histórico completo com forma de pagamento
- **Relatórios** — faturamento do mês, ticket médio, formas de pagamento, peças mais vendidas
- **Backup** — exporte/importe todos os dados em um arquivo `.json`

## Importante

- Os dados ficam **somente neste dispositivo/navegador**. Exporte backups regularmente (Configurações → Backup).
- Limpar os dados de navegação do navegador apaga os dados do aplicativo — faça backup antes.
