// Script de post-build para el frontend web.
// Se ejecuta después de `expo export --platform web`.
// 1. Copia app-ads.txt a la carpeta dist (requerido por AdMob).
// 2. Inyecta el script de Google AdSense en el <head> del dist/index.html
//    (requerido para verificar la propiedad del sitio en AdSense).
//
// Render sirve la carpeta `dist` en la raíz del dominio, así que el archivo
// queda accesible en https://dominio/app-ads.txt.

const fs = require('fs');
const path = require('path');

// Publisher ID de AdSense/AdMob (tu ID real)
const ADSENSE_PUBLISHER_ID = 'ca-pub-1350604989236740';

// --- 1. Copiar app-ads.txt ---
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

// --- 2. Inyectar etiqueta meta + script de AdSense en dist/index.html ---
const htmlPath = path.join(destDir, 'index.html');
if (fs.existsSync(htmlPath)) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Marca para evitar duplicados
  const injectedMarker = 'data-adsense-injected="true"';
  const metaInjected = html.includes('<meta name="google-adsense-account"');

  const headInjection = [];

  // Etiqueta meta de verificación de AdSense:
  // <meta name="google-adsense-account" content="ca-pub-...">
  if (!metaInjected) {
    headInjection.push(
      `    <meta name="google-adsense-account" content="${ADSENSE_PUBLISHER_ID}">`
    );
  }

  // Script de AdSense (código de verificación y monetización):
  // <script async src="...adsbygoogle.js?client=ca-pub-..." crossorigin="anonymous"></script>
  if (!html.includes(injectedMarker)) {
    headInjection.push(
      `    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUBLISHER_ID}" crossorigin="anonymous" ${injectedMarker}></script>`
    );
  }

  if (headInjection.length > 0) {
    const injectionBlock = headInjection.join('\n');

    // Insertar después de la etiqueta <head> (o antes de </head> si no se encuentra)
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n${injectionBlock}`);
    } else {
      html = html.replace('</head>', `${injectionBlock}\n  </head>`);
    }

    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('✅ Etiquetas de AdSense inyectadas en dist/index.html');
  } else {
    console.log('ℹ️  Las etiquetas de AdSense ya estaban presentes en dist/index.html');
  }
} else {
  console.warn('⚠️  No se encontró dist/index.html para inyectar AdSense');
}
