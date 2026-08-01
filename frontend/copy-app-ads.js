// Script para copiar app-ads.txt a la carpeta dist (build de web)
// Se ejecuta después de `expo export --platform web`
// Render sirve la carpeta `dist` en la raíz del dominio, así que este archivo
// queda accesible en https://dominio/app-ads.txt (requerido por AdMob).

const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, 'app-ads.txt');
const destDir = path.join(__dirname, 'dist');
const dest = path.join(destDir, 'app-ads.txt');

if (!fs.existsSync(source)) {
  console.error('✋ No se encontró app-ads.txt en', source);
  process.exit(1);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(source, dest);
console.log('✅ app-ads.txt copiado a:', dest);