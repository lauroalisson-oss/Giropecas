// Copia o aplicativo offline (../offline-app) para ./app antes de empacotar.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'offline-app');
const dest = path.join(__dirname, '..', 'app');

if (!fs.existsSync(src)) {
  console.error('Pasta offline-app não encontrada em', src);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

// sw.js/manifest.json são do modo PWA (navegador); no Electron não são usados,
// mas copiá-los não causa problema — o index.html só registra o SW em http(s).
for (const file of fs.readdirSync(src)) {
  if (file === 'README.md') continue;
  fs.cpSync(path.join(src, file), path.join(dest, file), { recursive: true });
}

console.log('Aplicativo copiado para', dest);
