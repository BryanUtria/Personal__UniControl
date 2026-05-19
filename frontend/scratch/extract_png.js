const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'assets', 'Navegador.svg');
const pngDestPath = path.join(__dirname, '..', 'assets', 'Navegador.png');

try {
  const content = fs.readFileSync(svgPath, 'utf8');
  
  // Find base64 pattern in the href attribute
  const match = content.match(/href="data:image\/png;base64,([^"]+)"/);
  if (!match) {
    console.error('Could not find base64 image href inside the SVG file.');
    process.exit(1);
  }

  const base64Data = match[1];
  const buffer = Buffer.from(base64Data, 'base64');
  
  fs.writeFileSync(pngDestPath, buffer);
  console.log('Successfully extracted base64 image and saved to:', pngDestPath);
} catch (err) {
  console.error('Error extracting image:', err);
  process.exit(1);
}
