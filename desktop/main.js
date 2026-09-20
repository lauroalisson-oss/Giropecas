// Giropeças — janela desktop (Electron).
//
// O app abre em um de dois modos (ver config.js):
//   offline — as telas embutidas, dados só nesta máquina
//   nuvem   — o sistema Giropeças online, no endereço configurado
//
// Em ambos, a emissão de NFS-e roda AQUI: o certificado digital da oficina
// fica guardado nesta máquina e nunca é enviado a servidor nenhum. É esta a
// razão de existir o aplicativo — navegador não consegue usar o
// certificado para falar com o Sefin.
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const nfse = require('./nfse');
const config = require('./config');

let janela = null;

// Carrega a tela certa para o modo configurado.
function abrirModo(win) {
  const { modo, urlNuvem } = config.ler();

  if (modo === 'nuvem' && urlNuvem) {
    win.loadURL(urlNuvem);
    return;
  }
  if (modo === 'offline') {
    win.loadFile(path.join(__dirname, 'app', 'index.html'));
    return;
  }
  win.loadFile(path.join(__dirname, 'conectar.html'));
}

// Só o endereço configurado pode ser aberto dentro da janela. Qualquer
// outro link vai para o navegador do sistema.
//
// Isto não é zelo excessivo: a janela tem a ponte de emissão. Se uma página
// estranha conseguisse carregar aqui dentro, ela teria como pedir uma
// assinatura com o certificado da oficina.
function pinarNavegacao(win) {
  win.webContents.on('will-navigate', (evento, url) => {
    if (!config.origemAutorizada(url)) {
      evento.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function menu(win) {
  return Menu.buildFromTemplate([
    {
      label: 'Sistema',
      submenu: [
        {
          label: 'Recarregar',
          accelerator: 'F5',
          click: () => win.webContents.reload(),
        },
        {
          label: 'Trocar de modo (online / offline)...',
          click: async () => {
            const { response } = await dialog.showMessageBox(win, {
              type: 'question',
              buttons: ['Conectar a outro endereço', 'Usar modo offline', 'Cancelar'],
              defaultId: 2,
              cancelId: 2,
              title: 'Trocar de modo',
              message: 'Como este computador deve abrir o Giropeças?',
              detail: 'O certificado digital instalado aqui continua guardado do mesmo jeito.',
            });
            if (response === 0) {
              config.salvar({ modo: null });
              win.loadFile(path.join(__dirname, 'conectar.html'));
            } else if (response === 1) {
              config.salvar({ modo: 'offline' });
              win.loadFile(path.join(__dirname, 'app', 'index.html'));
            }
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
  ]);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Giropeças',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  janela = win;

  // Seletor do arquivo do certificado. Fica aqui porque precisa da janela.
  ipcMain.handle('nfse:certificado:escolher', async (evento) => {
    if (!config.origemAutorizada(evento.senderFrame?.url)) return null;
    const r = await dialog.showOpenDialog(win, {
      title: 'Selecione o certificado digital A1',
      filters: [{ name: 'Certificado A1', extensions: ['pfx', 'p12'] }],
      properties: ['openFile'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  pinarNavegacao(win);
  Menu.setApplicationMenu(menu(win));
  abrirModo(win);
}

// --- Configuração do modo (pedida pela tela conectar.html) --------------
ipcMain.handle('app:conectar-nuvem', (evento, url) => {
  try {
    const origem = config.normalizarUrl(url);
    config.salvar({ modo: 'nuvem', urlNuvem: origem });
    janela?.loadURL(origem);
    return { ok: true, url: origem };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('app:usar-offline', () => {
  config.salvar({ modo: 'offline' });
  janela?.loadFile(path.join(__dirname, 'app', 'index.html'));
  return { ok: true };
});

app.whenReady().then(() => {
  nfse.registrar();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
