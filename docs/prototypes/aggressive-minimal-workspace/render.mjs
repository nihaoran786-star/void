// PROTOTYPE renderer: exports all structural variants without opening a visible window.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const requireFromE2E = createRequire(path.join(repoRoot, 'tests', 'e2e', 'package.json'));
const puppeteer = requireFromE2E('puppeteer-core');

function findChromiumExecutable(root) {
  if (!root || !existsSync(root)) return undefined;
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      if (
        entry.isFile()
        && entry.name.toLowerCase() === 'chrome.exe'
        && /(?:chrome-win|chrome-win64)[\\/]/i.test(entryPath)
      ) {
        return entryPath;
      }
    }
  }
  return undefined;
}

const chromiumPath = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : undefined,
  process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.cache', 'puppeteer') : undefined,
].map(findChromiumExecutable).find(Boolean);

if (!chromiumPath) {
  throw new Error('No cached Chromium executable is available for prototype capture.');
}

const outputDirectory = path.join(repoRoot, '.codex-artifacts', 'aggressive-minimal-prototype');
mkdirSync(outputDirectory, { recursive: true });
const prototypeUrl = pathToFileURL(path.join(import.meta.dirname, 'index.html'));
const variants = [
  ['A', 'codex-core'],
  ['B', 'media-focus'],
  ['C', 'command-stream'],
];
const viewports = [
  { width: 1536, height: 900, suffix: '' },
  { width: 1366, height: 768, suffix: '-1366x768' },
];

const browser = await puppeteer.launch({
  executablePath: chromiumPath,
  headless: true,
  args: [
    '--disable-background-networking',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-crash-reporter',
    '--disable-gpu',
    '--no-first-run',
  ],
});

try {
  const page = await browser.newPage();
  for (const viewport of viewports) {
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
    });
    for (const [variant, slug] of variants) {
      const url = new URL(prototypeUrl);
      url.searchParams.set('variant', variant);
      url.searchParams.set('capture', '1');
      await page.goto(url.href, { waitUntil: 'load' });
      const layout = await page.evaluate(() => ({
        clientHeight: document.documentElement.clientHeight,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      if (
        layout.scrollWidth > layout.clientWidth
        || layout.scrollHeight > layout.clientHeight
      ) {
        throw new Error(
          `Variant ${variant} overflows its viewport: ${JSON.stringify(layout)}`,
        );
      }
      await page.screenshot({
        path: path.join(
          outputDirectory,
          `${variant.toLowerCase()}-${slug}${viewport.suffix}.png`,
        ),
        fullPage: false,
      });
      console.log(
        `${variant} @ ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`,
      );
    }
  }
} finally {
  await browser.close();
}

console.log(outputDirectory);
