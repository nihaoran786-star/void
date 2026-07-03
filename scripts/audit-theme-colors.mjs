#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = 'src/web-ui/src';
const DEFAULT_BASELINE = 'scripts/theme-color-governance-baseline.json';
const COLOR_EXTENSIONS = new Set(['.css', '.scss', '.ts', '.tsx', '.json']);
const COLOR_PATTERN =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[-+]?\d*\.?\d+\s*,\s*[-+]?\d*\.?\d+\s*,\s*[-+]?\d*\.?\d+(?:\s*,\s*[-+]?\d*\.?\d+)?\s*\)/g;
const CSS_VAR_USAGE_PATTERN = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
const CSS_VAR_DEFINITION_PATTERN = /(^|[;{\s])(--[a-zA-Z0-9_-]+)\s*:/g;
const VAR_FALLBACK_PATTERN = /var\(\s*(--[a-zA-Z0-9_-]+)\s*,/g;
const CSS_VAR_SET_PROPERTY_PATTERN = /\.setProperty\(\s*['"`](--[a-zA-Z0-9_-]+)/g;
const CSS_VAR_INLINE_STYLE_PATTERN = /['"`](--[a-zA-Z0-9_-]+)['"`]\s*:/g;

export function parseColor(color) {
  const trimmed = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(trimmed);
  if (hex) {
    const raw = hex[1];
    const expanded = raw.length === 3 || raw.length === 4
      ? raw.split('').map(char => char + char).join('')
      : raw;
    const rgbHex = expanded.slice(0, 6);
    const alphaHex = expanded.length === 8 ? expanded.slice(6, 8) : null;
    const parsed = {
      r: Number.parseInt(rgbHex.slice(0, 2), 16),
      g: Number.parseInt(rgbHex.slice(2, 4), 16),
      b: Number.parseInt(rgbHex.slice(4, 6), 16),
      a: alphaHex ? Math.round((Number.parseInt(alphaHex, 16) / 255) * 1000) / 1000 : 1,
    };
    return { ...parsed, key: colorKey(parsed) };
  }

  const rgb = /^rgba?\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)(?:\s*,\s*([-+]?\d*\.?\d+))?\s*\)$/.exec(trimmed);
  if (!rgb) {
    return null;
  }
  const parsed = {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: rgb[4] === undefined ? 1 : Number(rgb[4]),
  };
  return { ...parsed, key: colorKey(parsed) };
}

function colorKey(color) {
  return `${color.r},${color.g},${color.b},${color.a}`;
}

function walkFiles(root) {
  const result = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'build', 'target', '.git'].includes(entry.name)) {
          continue;
        }
        stack.push(fullPath);
      } else if (entry.isFile() && COLOR_EXTENSIONS.has(path.extname(entry.name))) {
        result.push(fullPath);
      }
    }
  }
  return result.sort();
}

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function isAuditTestFile(relativePath) {
  return /(^|\/)__tests__\//.test(relativePath) || /\.(?:test|spec)\.[a-z0-9]+$/i.test(relativePath);
}

function isGeneratedBuildArtifact(relativePath) {
  return (
    relativePath === 'generated/version.ts' ||
    relativePath === 'generated/version-injection.html' ||
    relativePath.startsWith('dist/') ||
    relativePath.startsWith('build/')
  );
}

function collectMatches(content, pattern) {
  pattern.lastIndex = 0;
  return Array.from(content.matchAll(pattern));
}

function stripCommentsForAudit(content, { stripLineComments = true } = {}) {
  let output = '';
  let state = 'code';
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') {
        state = 'code';
        output += char;
      } else {
        output += ' ';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        state = 'code';
      } else {
        output += char === '\n' || char === '\r' ? char : ' ';
      }
      continue;
    }

    if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'block-comment';
      continue;
    }

    if (stripLineComments && char === '/' && next === '/') {
      output += '  ';
      index += 1;
      state = 'line-comment';
      continue;
    }

    output += char;
  }
  return output;
}

function createAuditContent(content, relativePath) {
  return stripCommentsForAudit(content, {
    stripLineComments: !relativePath.endsWith('.css'),
  });
}

export function collectThemeColorEntriesFromText(file, text) {
  const entries = [];
  const auditText = createAuditContent(text, file);
  for (const match of collectMatches(auditText, COLOR_PATTERN)) {
    const parsed = parseColor(match[0]);
    if (!parsed) {
      continue;
    }
    entries.push({
      file,
      color: match[0].toLowerCase(),
      colorKey: parsed.key,
      line: auditText.slice(0, match.index).split(/\r?\n/).length,
    });
  }
  return entries;
}

export function collectCssVarReferences(file, text) {
  const auditText = createAuditContent(text, file);
  const definitions = collectMatches(auditText, CSS_VAR_DEFINITION_PATTERN).map(match => ({
    file,
    name: match[2],
  }));
  const runtimeDefinitions = [
    ...collectMatches(auditText, CSS_VAR_SET_PROPERTY_PATTERN),
    ...collectMatches(auditText, CSS_VAR_INLINE_STYLE_PATTERN),
  ].map(match => ({
    file,
    name: match[1],
  }));
  const usages = collectMatches(auditText, CSS_VAR_USAGE_PATTERN).map(match => ({
    file,
    name: match[1],
  }));
  const fallbacks = collectMatches(auditText, VAR_FALLBACK_PATTERN).map(match => ({
    file,
    name: match[1],
  }));

  return {
    definitions: [...definitions, ...runtimeDefinitions],
    usages,
    fallbacks,
  };
}

function incrementMap(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function addSetMap(map, key, value) {
  const values = map.get(key) ?? new Set();
  values.add(value);
  map.set(key, values);
}

function topEntries(map, limit) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function colorDistance(left, right) {
  return Math.sqrt(
    (left.r - right.r) ** 2 +
    (left.g - right.g) ** 2 +
    (left.b - right.b) ** 2,
  );
}

export function findNearColorPairs(entries) {
  const byColor = new Map();
  const filesByColor = new Map();
  for (const entry of entries) {
    const parsed = parseColor(entry.color);
    if (!parsed) {
      continue;
    }
    const existing = byColor.get(entry.color) ?? { color: entry.color, parsed, count: 0 };
    existing.count += 1;
    byColor.set(entry.color, existing);
    addSetMap(filesByColor, entry.color, entry.file);
  }

  const colors = Array.from(byColor.values()).sort((a, b) => a.color.localeCompare(b.color));
  const indistinguishable = [];
  const near = [];
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      const left = colors[i];
      const right = colors[j];
      const alphaDiff = Math.abs(left.parsed.a - right.parsed.a);
      const distance = colorDistance(left.parsed, right.parsed);
      const row = {
        key: [left.color, right.color].sort().join(' <-> '),
        a: left.color,
        b: right.color,
        distance: Number(distance.toFixed(2)),
        alphaDiff: Number(alphaDiff.toFixed(3)),
        count: left.count + right.count,
        files: Array.from(new Set([
          ...filesByColor.get(left.color),
          ...filesByColor.get(right.color),
        ])).sort().slice(0, 8),
      };
      if (distance > 0 && distance <= 2 && alphaDiff <= 0.003) {
        indistinguishable.push(row);
      } else if (distance > 2 && distance <= 10 && alphaDiff <= 0.03) {
        near.push(row);
      }
    }
  }

  const byImpact = (a, b) => b.count - a.count || a.distance - b.distance;
  indistinguishable.sort(byImpact);
  near.sort(byImpact);
  return {
    indistinguishableTotal: indistinguishable.length,
    nearTotal: near.length,
    indistinguishable: indistinguishable.slice(0, 50),
    near: near.slice(0, 50),
  };
}

export function auditThemeColors(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const top = options.top ?? 20;
  const files = walkFiles(root);
  const colorCounts = new Map();
  const fileColorCounts = new Map();
  const definitionFiles = new Map();
  const usageCounts = new Map();
  const fallbackCounts = new Map();
  const allColorEntries = [];
  let filesScanned = 0;
  let ignoredTestFiles = 0;
  let ignoredGeneratedFiles = 0;
  let filesWithColors = 0;

  for (const file of files) {
    const relativeToRoot = normalizePath(path.relative(root, file));
    const relativeToCwd = normalizePath(path.relative(process.cwd(), file));
    if (isAuditTestFile(relativeToRoot)) {
      ignoredTestFiles += 1;
      continue;
    }
    if (isGeneratedBuildArtifact(relativeToRoot)) {
      ignoredGeneratedFiles += 1;
      continue;
    }

    filesScanned += 1;
    const text = fs.readFileSync(file, 'utf8');
    const colors = collectThemeColorEntriesFromText(relativeToCwd, text);
    if (colors.length > 0) {
      filesWithColors += 1;
    }
    allColorEntries.push(...colors);
    for (const entry of colors) {
      incrementMap(colorCounts, entry.color);
      incrementMap(fileColorCounts, relativeToCwd);
    }

    const refs = collectCssVarReferences(relativeToCwd, text);
    for (const entry of refs.definitions) {
      addSetMap(definitionFiles, entry.name, entry.file);
    }
    for (const entry of refs.usages) {
      incrementMap(usageCounts, entry.name);
    }
    for (const entry of refs.fallbacks) {
      incrementMap(fallbackCounts, entry.name);
    }
  }

  const definedVars = new Set(definitionFiles.keys());
  const fallbackVars = new Set(fallbackCounts.keys());
  const undefinedVars = Array.from(usageCounts.keys())
    .filter(name => !definedVars.has(name) && !fallbackVars.has(name))
    .sort();
  const fallbackOnlyVars = Array.from(fallbackVars)
    .filter(name => !definedVars.has(name))
    .sort();
  const nearPairs = findNearColorPairs(allColorEntries);

  return {
    root: normalizePath(root),
    filesScanned,
    ignoredTestFiles,
    ignoredGeneratedFiles,
    filesWithColors,
    colorOccurrences: allColorEntries.length,
    uniqueColors: colorCounts.size,
    topColors: topEntries(colorCounts, top),
    topFiles: topEntries(fileColorCounts, top),
    cssVars: {
      definedUnique: definedVars.size,
      usedUnique: usageCounts.size,
      fallbackOccurrences: Array.from(fallbackCounts.values()).reduce((sum, count) => sum + count, 0),
      fallbackUnique: fallbackCounts.size,
      fallbackOnlyUnique: fallbackOnlyVars.length,
      undefinedUnique: undefinedVars.length,
      undefinedVars: undefinedVars.slice(0, 100).map(key => ({ key, count: usageCounts.get(key) ?? 0 })),
      fallbackOnlyVars: fallbackOnlyVars.slice(0, 100).map(key => ({ key, count: fallbackCounts.get(key) ?? 0 })),
    },
    nearPairs,
    summary: {
      baseline: {
        path: null,
        enforced: false,
        failures: [],
      },
    },
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

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const failures = [];
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

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      options.root = argv[++index];
      if (!options.root) {
        throw new Error('--root requires a path');
      }
    } else if (arg.startsWith('--root=')) {
      options.root = arg.slice('--root='.length);
      if (!options.root) {
        throw new Error('--root requires a path');
      }
    } else if (arg === '--baseline') {
      options.baseline = argv[++index];
      if (!options.baseline) {
        throw new Error('--baseline requires a path');
      }
    } else if (arg.startsWith('--baseline=')) {
      options.baseline = arg.slice('--baseline='.length);
      if (!options.baseline) {
        throw new Error('--baseline requires a path');
      }
    } else if (arg === '--report-json') {
      options.reportJson = argv[++index];
      if (!options.reportJson) {
        throw new Error('--report-json requires a path');
      }
    } else if (arg.startsWith('--report-json=')) {
      options.reportJson = arg.slice('--report-json='.length);
      if (!options.reportJson) {
        throw new Error('--report-json requires a path');
      }
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--top') {
      options.top = Number.parseInt(argv[++index], 10);
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

function printRows(title, rows) {
  console.log(title);
  if (rows.length === 0) {
    console.log('  none');
    return;
  }
  for (const row of rows) {
    console.log(`${String(row.count).padStart(7)}  ${row.key}`);
  }
}

function printNearPairs(title, rows) {
  console.log(title);
  if (rows.length === 0) {
    console.log('  none');
    return;
  }
  for (const row of rows.slice(0, 10)) {
    console.log(`  ${row.key} distance=${row.distance} alphaDiff=${row.alphaDiff} files=${row.files.join(', ')}`);
  }
}

function printReport(report) {
  console.log(`Theme color audit: ${report.root}`);
  console.log(`Files scanned: ${report.filesScanned}`);
  console.log(`Ignored test files: ${report.ignoredTestFiles}`);
  console.log(`Ignored generated files: ${report.ignoredGeneratedFiles}`);
  console.log(`Files with colors: ${report.filesWithColors}`);
  console.log(`Color occurrences: ${report.colorOccurrences}`);
  console.log(`Unique colors: ${report.uniqueColors}`);
  console.log(`CSS vars defined unique: ${report.cssVars.definedUnique}`);
  console.log(`CSS vars used unique: ${report.cssVars.usedUnique}`);
  console.log(`Fallback var occurrences: ${report.cssVars.fallbackOccurrences}`);
  console.log(`Fallback-only vars: ${report.cssVars.fallbackOnlyUnique}`);
  console.log(`Undefined vars: ${report.cssVars.undefinedUnique}`);
  console.log(`Indistinguishable color pairs: ${report.nearPairs.indistinguishableTotal}`);
  console.log(`Near color pairs: ${report.nearPairs.nearTotal}`);
  console.log('');
  printRows('Top colors:', report.topColors);
  console.log('');
  printRows('Top files:', report.topFiles);
  console.log('');
  printRows('Undefined vars:', report.cssVars.undefinedVars.slice(0, 10));
  console.log('');
  printRows('Fallback-only vars:', report.cssVars.fallbackOnlyVars.slice(0, 10));
  console.log('');
  printNearPairs('Indistinguishable color pairs:', report.nearPairs.indistinguishable);
  console.log('');
  printNearPairs('Near color pairs:', report.nearPairs.near);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = auditThemeColors({ root: options.root, top: options.top });
  if (options.reportJson) {
    writeReportJson(report, options.reportJson);
  }

  const baselineFailures = checkBaseline(report, options.baseline);
  report.summary.baseline = {
    path: options.baseline,
    enforced: Boolean(options.baseline),
    failures: baselineFailures,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  if (baselineFailures.length > 0) {
    console.error('');
    console.error('Theme color audit baseline failures:');
    for (const failure of baselineFailures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
