#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const webUiRoot = path.join(repoRoot, 'src/web-ui');
const generatedDir = path.join(
  repoRoot,
  'src/web-ui/src/infrastructure/theme/presets/generated',
);

const outputFiles = {
  startupThemeBootstrap: path.join(generatedDir, 'startup-theme-bootstrap.json'),
  themePromptSnapshots: path.join(generatedDir, 'theme-prompt-snapshots.json'),
};

function parseArgs(argv) {
  const options = {
    check: false,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--check') {
      options.check = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function normalizeGeneratedText(content) {
  return String(content).replace(/\r\n?/g, '\n');
}

async function createGeneratedFiles() {
  const server = await createServer({
    root: webUiRoot,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true },
    optimizeDeps: {
      entries: [],
      noDiscovery: true,
    },
  });

  try {
    const [
      { builtinThemes },
      { createStartupThemeBootstrapManifest },
      { createThemePromptSnapshotManifest },
    ] = await Promise.all([
      server.ssrLoadModule('/src/infrastructure/theme/presets/index.ts'),
      server.ssrLoadModule('/src/infrastructure/theme/presets/startupThemeBootstrap.ts'),
      server.ssrLoadModule('/src/infrastructure/theme/presets/themePromptSnapshots.ts'),
    ]);

    return [
      {
        label: 'Startup theme bootstrap manifest',
        outputPath: outputFiles.startupThemeBootstrap,
        content: `${JSON.stringify(createStartupThemeBootstrapManifest(builtinThemes), null, 2)}\n`,
      },
      {
        label: 'Theme prompt snapshot manifest',
        outputPath: outputFiles.themePromptSnapshots,
        content: `${JSON.stringify(createThemePromptSnapshotManifest(builtinThemes), null, 2)}\n`,
      },
    ];
  } finally {
    await server.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const generatedFiles = await createGeneratedFiles();
  const staleFiles = [];

  for (const generatedFile of generatedFiles) {
    const currentContent = fs.existsSync(generatedFile.outputPath)
      ? fs.readFileSync(generatedFile.outputPath, 'utf8')
      : null;
    const expected = normalizeGeneratedText(generatedFile.content);
    const current = currentContent == null ? null : normalizeGeneratedText(currentContent);

    if (options.check) {
      if (current !== expected) {
        staleFiles.push(generatedFile);
      }
      continue;
    }

    fs.mkdirSync(path.dirname(generatedFile.outputPath), { recursive: true });
    fs.writeFileSync(generatedFile.outputPath, generatedFile.content, 'utf8');
    if (!options.json) {
      console.log(`Generated ${path.relative(repoRoot, generatedFile.outputPath).replace(/\\/g, '/')}`);
    }
  }

  if (options.json) {
    console.log(JSON.stringify({
      generated: generatedFiles.map(file => path.relative(repoRoot, file.outputPath).replace(/\\/g, '/')),
      check: options.check,
      stale: staleFiles.map(file => path.relative(repoRoot, file.outputPath).replace(/\\/g, '/')),
    }, null, 2));
  }

  if (staleFiles.length > 0) {
    for (const generatedFile of staleFiles) {
      console.error(
        `${generatedFile.label} is stale. Run \`node scripts/generate-startup-theme-bootstrap.mjs\`.`,
      );
    }
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
