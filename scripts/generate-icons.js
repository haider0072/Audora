const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [192, 384, 512];
const publicDir = path.join(__dirname, '..', 'public');
const iconPath = path.join(__dirname, '..', 'app', 'icon.png');

async function generateIcons() {
  console.log('Generating PWA icons...');

  for (const size of sizes) {
    const outputPath = path.join(publicDir, `icon-${size}x${size}.png`);

    await sharp(iconPath)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Generated: icon-${size}x${size}.png`);
  }

  // Also generate apple-touch-icon
  await sharp(iconPath)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  console.log('Generated: apple-touch-icon.png');

  // Generate favicon
  await sharp(iconPath)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));

  console.log('Generated: favicon-32x32.png');

  await sharp(iconPath)
    .resize(16, 16)
    .png()
    .toFile(path.join(publicDir, 'favicon-16x16.png'));

  console.log('Generated: favicon-16x16.png');

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
