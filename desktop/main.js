// Giropeças Offline — janela desktop (Electron).
//
// Carrega o aplicativo offline (pasta app/); os dados e a licença ficam no
// localStorage, que o Electron persiste no perfil do usuário (userData).
//
// A emissão de NFS-e roda aqui: o certificado digital da oficina fica
// guardado nesta máquina e nunca é enviado a servidor nenhum.
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const nfse = require('./nfse');

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

  // Seletor do arquivo do certificado. Fica aqui porque precisa da janela.
  ipcMain.handle('nfse:certificado:escolher', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Selecione o certificado digital A1',
      filters: [{ name: 'Certificado A1', extensions: ['pfx', 'p12'] }],
      properties: ['openFile'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

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
