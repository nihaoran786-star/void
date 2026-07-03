#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = 'src/apps/cli';
const DEFAULT_BASELINE = 'scripts/theme-color-governance-baseline.cli.json';
const DEFAULT_NEAR_THRESHOLD = 10;

function cliRgbToHex(r, g, b) {
  return `#${[r, g, b].map(value => {
    const clamped = Math.max(0, Math.min(255, value));
    return clamped.toString(16).padStart(2, '0');
  }).join('')}`;
}

export function normalizeHexColor(value, options = {}) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (!/^#[0-9a-fA-F]{8}$/.test(trimmed)) {
    return null;
  }

  const hex = trimmed.slice(1);
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const alpha = Number.parseInt(hex.slice(6, 8), 16);
  const base = options.mode === 'light' ? 255 : 0;
  return cliRgbToHex(
    blendAlphaChannel(r, alpha, base),
    blendAlphaChannel(g, alpha, base),
    blendAlphaChannel(b, alpha, base),
  );
}

function blendAlphaChannel(fg, alpha, bg) {
  return Math.floor((fg * alpha + bg * (255 - alpha)) / 255);
}

function cliHexColorDistance(a, b) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  if (!left || !right) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.sqrt(
    (left.r - right.r) ** 2 +
    (left.g - right.g) ** 2 +
    (left.b - right.b) ** 2,
  );
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value);
  if (!normalized) {
    return null;
  }
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function collectPresetColorEntriesFromJson(file, jsonText) {
  const parsed = JSON.parse(jsonText);
  const theme = parsed.theme;
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    throw new Error(`${file} must contain a theme object`);
  }
  const defs = parsed.defs && typeof parsed.defs === 'object' && !Array.isArray(parsed.defs)
    ? parsed.defs
    : {};
  const defaultMode = /(?:^|[-_/])light(?:[-_.]|$)/i.test(file) ? 'light' : 'dark';

  return Object.entries(theme).flatMap(([key, value]) => {
    return collectColorValueEntries({
      file,
      key,
      value,
      theme,
      defs,
      mode: defaultMode,
      seen: new Set(),
    });
  });
}

function collectColorValueEntries({ file, key, value, theme, defs, mode, seen }) {
  if (typeof value === 'number') {
    return [];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'none' || trimmed.toLowerCase() === 'transparent') {
      return [];
    }
    const color = normalizeHexColor(trimmed, { mode });
    if (color) {
      return [{ file, key, color }];
    }

    const referenced = Object.prototype.hasOwnProperty.call(defs, trimmed)
      ? defs[trimmed]
      : Object.prototype.hasOwnProperty.call(theme, trimmed)
        ? theme[trimmed]
        : undefined;
    if (referenced === undefined) {
      return [];
    }
    if (seen.has(trimmed)) {
      throw new Error(`${file} theme color reference cycle detected at "${trimmed}"`);
    }
    const nextSeen = new Set(seen);
    nextSeen.add(trimmed);
    return collectColorValueEntries({
      file,
      key,
      value: referenced,
      theme,
      defs,
      mode,
      seen: nextSeen,
    });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  if (Object.prototype.hasOwnProperty.call(value, 'dark') && Object.prototype.hasOwnProperty.call(value, 'light')) {
    return [
      ...collectColorValueEntries({
        file,
        key: `${key}.dark`,
        value: value.dark,
        theme,
        defs,
        mode: 'dark',
        seen: new Set(seen),
      }),
      ...collectColorValueEntries({
        file,
        key: `${key}.light`,
        value: value.light,
        theme,
        defs,
        mode: 'light',
        seen: new Set(seen),
      }),
    ];
  }

  return [];
}

export function collectRustFallbackEntriesFromText(file, sourceText) {
  const entries = [];
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*):\s*Color::Rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/g;
  let match;
  while ((match = pattern.exec(sourceText)) !== null) {
    entries.push({
      file,
      key: match[1],
      color: cliRgbToHex(
        Number.parseInt(match[2], 10),
        Number.parseInt(match[3], 10),
        Number.parseInt(match[4], 10),
      ),
    });
  }
  return entries;
}

export function findNearPairs(entries, threshold = DEFAULT_NEAR_THRESHOLD) {
  const filesByColor = new Map();
  const keysByColor = new Map();
  for (const entry of entries) {
    if (!filesByColor.has(entry.color)) {
      filesByColor.set(entry.color, new Set());
      keysByColor.set(entry.color, new Set());
    }
    filesByColor.get(entry.color).add(entry.file);
    keysByColor.get(entry.color).add(`${entry.file}:${entry.key}`);
  }

  const colors = Array.from(filesByColor.keys()).sort();
  const pairs = [];
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      const distance = cliHexColorDistance(colors[i], colors[j]);
      if (distance > 0 && distance <= threshold) {
        pairs.push({
          a: colors[i],
          b: colors[j],
          distance: Number(distance.toFixed(2)),
          files: Array.from(new Set([
            ...filesByColor.get(colors[i]),
            ...filesByColor.get(colors[j]),
          ])).sort(),
          keysByColor: {
            [colors[i]]: Array.from(keysByColor.get(colors[i])).sort(),
            [colors[j]]: Array.from(keysByColor.get(colors[j])).sort(),
          },
        });
      }
    }
  }

  pairs.sort((left, right) => left.distance - right.distance || left.a.localeCompare(right.a));
  return pairs;
}

function countByColor(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.color, (counts.get(entry.color) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color));
}

function listPresetFiles(root) {
  const presetDir = path.join(root, 'themes', 'presets');
  return fs.readdirSync(presetDir)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => path.join(presetDir, file));
}

function relativePath(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/');
}

function readPresetEntries(files) {
  return files.flatMap(file => {
    return collectPresetColorEntriesFromJson(relativePath(file), fs.readFileSync(file, 'utf8'));
  });
}

function readRustFallbackEntries(root) {
  const fullPath = path.join(root, 'src', 'ui', 'theme.rs');
  return collectRustFallbackEntriesFromText(relativePath(fullPath), fs.readFileSync(fullPath, 'utf8'));
}

export function createCliThemeColorReport(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const threshold = options.nearThreshold ?? DEFAULT_NEAR_THRESHOLD;
  const presetFiles = listPresetFiles(root);
  const presetEntries = readPresetEntries(presetFiles);
  const rustFallbackEntries = readRustFallbackEntries(root);
  const allEntries = [...presetEntries, ...rustFallbackEntries];
  const presetNearPairs = findNearPairs(presetEntries, threshold);
  const rustFallbackNearPairs = findNearPairs(rustFallbackEntries, threshold);

  return {
    root,
    presetFiles: presetFiles.length,
    presetColorOccurrences: presetEntries.length,
    presetUniqueColors: new Set(presetEntries.map(entry => entry.color)).size,
    rustFallbackColorOccurrences: rustFallbackEntries.length,
    rustFallbackUniqueColors: new Set(rustFallbackEntries.map(entry => entry.color)).size,
    totalUniqueColors: new Set(allEntries.map(entry => entry.color)).size,
    nearThreshold: threshold,
    presetNearPairs: {
      nearTotal: presetNearPairs.length,
      near: presetNearPairs,
    },
    rustFallbackNearPairs: {
      nearTotal: rustFallbackNearPairs.length,
      near: rustFallbackNearPairs,
    },
    topPresetColors: countByColor(presetEntries),
    topRustFallbackColors: countByColor(rustFallbackEntries),
  };
}

function getMetric(report, metric) {
  return metric.split('.').reduce((value, segment) => {
    if (value && typeof value === 'object') {
      return value[segment];
    }
    return undefined;
  }, report);
}

export function checkBaseline(report, baselinePath) {
  if (!baselinePath) {
    return [];
  }
  if (!fs.existsSync(baselinePath)) {
    return [`${baselinePath} does not exist`];
  }

  const failures = [];
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (baseline.version !== 1) {
    failures.push(`${baselinePath} version must be 1`);
  }
  if (!baseline.budgets || typeof baseline.budgets !== 'object' || Array.isArray(baseline.budgets)) {
    failures.push(`${baselinePath} budgets must be an object`);
    return failures;
  }

  for (const [metric, budget] of Object.entries(baseline.budgets)) {
    if (!budget || typeof budget !== 'object' || Array.isArray(budget)) {
      failures.push(`${metric} budget must be an object`);
      continue;
    }
    if (typeof budget.max !== 'number') {
      failures.push(`${metric}.max must be a number`);
      continue;
    }

    const actual = getMetric(report, metric);
    if (typeof actual !== 'number') {
      failures.push(`${metric} report value must be a number`);
    } else if (actual > budget.max) {
      failures.push(`${metric} has ${actual} candidate(s), above baseline ${budget.max}`);
    } else if (actual < budget.max) {
      failures.push(`${metric} has ${actual} candidate(s), below baseline ${budget.max}; lower the baseline with this improvement`);
    }
  }

  return failures;
}

export function writeReportJson(report, reportJsonPath) {
  fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    baseline: DEFAULT_BASELINE,
    json: false,
    reportJson: null,
    top: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') {
      options.root = argv[++i];
      if (!options.root) {
        throw new Error('--root requires a path');
      }
    } else if (arg.startsWith('--root=')) {
      options.root = arg.slice('--root='.length);
      if (!options.root) {
        throw new Error('--root requires a path');
      }
    } else if (arg === '--baseline') {
      options.baseline = argv[++i];
      if (!options.baseline) {
        throw new Error('--baseline requires a baseline path');
      }
    } else if (arg.startsWith('--baseline=')) {
      options.baseline = arg.slice('--baseline='.length);
      if (!options.baseline) {
        throw new Error('--baseline requires a baseline path');
      }
    } else if (arg === '--report-json') {
      options.reportJson = argv[++i];
      if (!options.reportJson) {
        throw new Error('--report-json requires an output path');
      }
    } else if (arg.startsWith('--report-json=')) {
      options.reportJson = arg.slice('--report-json='.length);
      if (!options.reportJson) {
        throw new Error('--report-json requires an output path');
      }
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--top') {
      options.top = Number.parseInt(argv[++i], 10);
    } else if (arg.startsWith('--top=')) {
      options.top = Number.parseInt(arg.slice('--top='.length), 10);
    } else if (arg === '--no-baseline') {
      options.baseline = null;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printRows(title, rows, top) {
  console.log(title);
  if (rows.length === 0) {
    console.log('  none');
    return;
  }
  for (const row of rows.slice(0, top)) {
    if ('count' in row) {
      console.log(`${String(row.count).padStart(7)}  ${row.color}`);
    } else {
      console.log(`  ${row.a} <-> ${row.b} distance=${row.distance} files=${row.files.join(', ')}`);
    }
  }
}

function printReport(report, top) {
  console.log(`CLI theme color audit: ${report.root}`);
  console.log(`Preset files: ${report.presetFiles}`);
  console.log(`Preset color occurrences: ${report.presetColorOccurrences}`);
  console.log(`Preset unique colors: ${report.presetUniqueColors}`);
  console.log(`Rust fallback Color::Rgb occurrences: ${report.rustFallbackColorOccurrences}`);
  console.log(`Rust fallback unique colors: ${report.rustFallbackUniqueColors}`);
  console.log(`Total CLI unique colors: ${report.totalUniqueColors}`);
  console.log(`Preset near pairs: ${report.presetNearPairs.nearTotal}`);
  console.log(`Rust fallback near pairs: ${report.rustFallbackNearPairs.nearTotal}`);
  console.log('');
  printRows('Top preset colors:', report.topPresetColors, top);
  console.log('');
  printRows('Top Rust fallback colors:', report.topRustFallbackColors, top);
  console.log('');
  printRows('Preset near pairs:', report.presetNearPairs.near, Math.min(top, 20));
  console.log('');
  printRows('Rust fallback near pairs:', report.rustFallbackNearPairs.near, Math.min(top, 20));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = createCliThemeColorReport({ root: options.root });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, options.top);
  }

  if (options.reportJson) {
    writeReportJson(report, options.reportJson);
  }

  const failures = checkBaseline(report, options.baseline);
  if (failures.length > 0) {
    console.error('');
    console.error('CLI theme color audit failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
