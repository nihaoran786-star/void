import fs from 'node:fs';
import sharp from 'sharp';

const sourceSvg = fs.readFileSync('brand/assets/void-logo-source.svg');

const appIconBackground = Buffer.from(`
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect x="88" y="88" width="848" height="848" rx="172" fill="#f7f7f5"/>
  <rect x="88.5" y="88.5" width="847" height="847" rx="171.5" fill="none" stroke="#e7e5df"/>
</svg>
`);

const titleText = Buffer.from(`
<svg width="915" height="271" viewBox="0 0 915 271" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      font-weight: 600;
      letter-spacing: -6px;
    }
  </style>
  <text x="238" y="178" font-size="132" fill="#0a0a0a">Void</text>
</svg>
`);

async function writePng(buffer, paths) {
  await Promise.all(paths.map((path) => sharp(buffer).png().toFile(path)));
}

async function main() {
  const markBlack = await sharp(sourceSvg).resize(1024, 1024).png().toBuffer();
  await writePng(markBlack, [
    'brand/assets/void-logo-source.png',
    'brand/assets/void-logo-mark-black.png',
    'png/Void-Logo.png',
    'src/web-ui/public/Void-Logo.png',
  ]);

  await sharp(markBlack)
    .negate({ alpha: false })
    .png()
    .toFile('brand/assets/void-logo-mark-white.png');

  const iconMark = await sharp(sourceSvg).resize(650, 650).png().toBuffer();
  const appIcon = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: appIconBackground, left: 0, top: 0 },
      { input: iconMark, left: 187, top: 187 },
    ])
    .png()
    .toBuffer();

  await writePng(appIcon, [
    'brand/assets/void-app-icon.png',
    'src/apps/desktop/icons/Logo-ICON.png',
    'src/web-ui/public/Logo-ICON.png',
    'src/mobile-web/src/assets/Logo-ICON.png',
    'Void-Installer/src/Logo-ICON.png',
  ]);

  await Promise.all([
    sharp(appIcon).resize(512, 512).png().toFile('src/apps/desktop/icons/icon.png'),
    sharp(appIcon).resize(512, 512).png().toFile('Void-Installer/src-tauri/icons/icon.png'),
  ]);

  await Promise.all(
    [16, 32, 48, 64, 96, 128, 256, 512].map((size) =>
      sharp(appIcon)
        .resize(size, size)
        .png()
        .toFile(`src/apps/desktop/icons/hicolor/${size}x${size}/apps/void-desktop.png`),
    ),
  );

  const titleLogo = await sharp(sourceSvg).resize(156, 156).png().toBuffer();
  await sharp({
    create: {
      width: 915,
      height: 271,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: titleLogo, left: 42, top: 58 },
      { input: titleText, left: 0, top: 0 },
    ])
    .png()
    .toFile('png/Void_title.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
