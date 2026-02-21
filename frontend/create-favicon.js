#!/usr/bin/env node
/**
 * Creates favicon.ico from logo.svg
 *
 * Usage:
 *   npm install --save-dev sharp sharp-ico
 *   node create-favicon.js
 *
 * Or use online tools (no installation needed):
 *   1. https://favicon.io/favicon-converter/
 *   2. https://convertio.co/svg-ico/
 *   3. https://cloudconvert.com/svg-to-ico
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('\n❌ Sharp package not found.');
  console.error('\nTo install sharp and create favicon.ico automatically:\n');
  console.error('  npm install --save-dev sharp sharp-ico');
  console.error('  node create-favicon.js\n');
  console.error('Or use a free online converter:\n');
  console.error('  1. Visit https://favicon.io/favicon-converter/');
  console.error('  2. Upload: frontend/public/logo.svg');
  console.error('  3. Download the generated favicon.ico');
  console.error('  4. Save to: frontend/public/favicon.ico\n');
  process.exit(1);
}

const logoPath = path.join(__dirname, 'public', 'logo.svg');
const faviconPath = path.join(__dirname, 'public', 'favicon.ico');

async function createFavicon() {
  try {
    console.log('📦 Creating favicon.ico from logo.svg...');

    // Create a 32x32 PNG first (ICO format requirement)
    const pngBuffer = await sharp(logoPath)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();

    // Try to use sharp-ico if available
    let sharpIco;
    try {
      sharpIco = require('sharp-ico');
      const icoBuffer = await sharpIco.encode([pngBuffer]);
      fs.writeFileSync(faviconPath, icoBuffer);
      console.log('✅ favicon.ico created successfully!');
    } catch (e) {
      // If sharp-ico not available, save as PNG and inform user
      console.warn('\n⚠️  sharp-ico not found. Saving as PNG instead.');
      console.warn('For true ICO format, install sharp-ico:\n');
      console.warn('  npm install --save-dev sharp-ico');
      console.warn('  node create-favicon.js\n');
      console.warn('Or use an online converter (recommended):\n');
      console.warn('  https://favicon.io/favicon-converter/\n');

      // Save as PNG with .ico extension (browsers will handle it)
      fs.writeFileSync(faviconPath, pngBuffer);
      console.log('✅ favicon.ico (PNG format) created.');
    }

    console.log(`\n📍 Location: ${faviconPath}\n`);
  } catch (error) {
    console.error('❌ Error creating favicon:', error.message);
    console.error('\nPlease use an online converter instead:');
    console.error('  https://favicon.io/favicon-converter/\n');
    process.exit(1);
  }
}

createFavicon();
