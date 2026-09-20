// Ponte segura entre a página e o processo principal.
//
// Com contextIsolation ligado, a página não tem acesso ao Node. Aqui
// expomos apenas as funções necessárias — e nenhuma delas devolve o
// certificado ou a senha.
//
// A autorização NÃO é decidida aqui: quem confere de qual endereço veio o
// pedido é o processo principal, a cada chamada. Este arquivo só encaminha.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('giropecasNFSe', {
  // Diz se há certificado configurado, de quem é e quando vence.
  situacaoCertificado: () => ipcRenderer.invoke('nfse:certificado:situacao'),

  // Recebe o caminho do .pfx escolhido pelo lojista e a senha.
  salvarCertificado: (caminho, senha) =>
    ipcRenderer.invoke('nfse:certificado:salvar', caminho, senha),

  removerCertificado: () => ipcRenderer.invoke('nfse:certificado:remover'),

  // Abre o seletor de arquivo e devolve só o caminho.
  escolherArquivo: () => ipcRenderer.invoke('nfse:certificado:escolher'),

  // xmlDps já montado; assina e transmite ao Sefin.
  emitir: (params) => ipcRenderer.invoke('nfse:emitir', params),

  consultar: (params) => ipcRenderer.invoke('nfse:consultar', params),

  // Cancelamento: registra o evento e101101 ligado à nota.
  cancelar: (params) => ipcRenderer.invoke('nfse:cancelar', params),

  // Pergunta se uma DPS já virou nota (emissão que caiu no meio).
  consultarDps: (params) => ipcRenderer.invoke('nfse:consultar-dps', params),

  // Permite ao app web saber que está rodando dentro do desktop.
  disponivel: true,
});

// Usado só pela tela de primeira abertura (conectar.html).
contextBridge.exposeInMainWorld('giropecasApp', {
  conectarNuvem: (url) => ipcRenderer.invoke('app:conectar-nuvem', url),
  usarOffline: () => ipcRenderer.invoke('app:usar-offline'),
});
