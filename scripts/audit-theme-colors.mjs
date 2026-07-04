#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = 'src/web-ui/src';
const DEFAULT_BASELINE = 'scripts/theme-color-governance-baseline.json';
const DEFAULT_NEAR_PAIR_DECISIONS = 'scripts/theme-color-near-pair-decisions.json';
const DEFAULT_CSS_VAR_CONTRACT = 'scripts/theme-css-var-contract.json';
const DEFAULT_COLOR_DOMAIN = 'app-ui';
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

function normalizeOwnedColorDomains(domains) {
  if (!Array.isArray(domains)) {
    return [];
  }

  return domains
    .filter(domain => domain && typeof domain === 'object' && !Array.isArray(domain))
    .map(domain => ({
      domain: domain.domain,
      owner: domain.owner,
      reason: domain.reason,
      mergePolicy: domain.mergePolicy,
      pathPrefixes: Array.isArray(domain.pathPrefixes)
        ? domain.pathPrefixes.map(prefix => normalizePath(prefix).replace(/\/$/, ''))
        : [],
    }))
    .filter(domain => isNonEmptyString(domain.domain));
}

function classifyColorDomain(relativeToRoot, relativeToCwd, ownedDomains) {
  const normalizedRootPath = normalizePath(relativeToRoot);
  const normalizedCwdPath = normalizePath(relativeToCwd);
  for (const domain of ownedDomains) {
    if (domain.pathPrefixes.some(prefix => (
      normalizedRootPath === prefix ||
      normalizedRootPath.startsWith(`${prefix}/`) ||
      normalizedCwdPath === prefix ||
      normalizedCwdPath.startsWith(`${prefix}/`)
    ))) {
      return domain.domain;
    }
  }

  return DEFAULT_COLOR_DOMAIN;
}

function topEntries(map, limit) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function setMapEntries(map) {
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, values]) => ({
      key,
      files: Array.from(values).sort(),
    }));
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
  const ownedColorDomains = normalizeOwnedColorDomains(options.ownedColorDomains);
  const files = walkFiles(root);
  const colorCounts = new Map();
  const fileColorCounts = new Map();
  const domainColorCounts = new Map();
  const domainOccurrenceCounts = new Map();
  const domainFiles = new Map();
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
    const colorDomain = classifyColorDomain(relativeToRoot, relativeToCwd, ownedColorDomains);
    for (const entry of colors) {
      incrementMap(colorCounts, entry.color);
      incrementMap(fileColorCounts, relativeToCwd);
      incrementMap(domainOccurrenceCounts, colorDomain);
      addSetMap(domainColorCounts, colorDomain, entry.colorKey);
      addSetMap(domainFiles, colorDomain, relativeToCwd);
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
  const colorDomains = [DEFAULT_COLOR_DOMAIN, ...ownedColorDomains.map(domain => domain.domain)]
    .filter((domain, index, all) => all.indexOf(domain) === index)
    .map(domain => {
      const owned = ownedColorDomains.find(entry => entry.domain === domain);
      return {
        domain,
        owner: owned?.owner ?? 'Void app UI',
        reason: owned?.reason ?? 'Default application UI color debt domain.',
        mergePolicy: owned?.mergePolicy ?? 'baseline',
        pathPrefixes: owned?.pathPrefixes ?? [],
        colorOccurrences: domainOccurrenceCounts.get(domain) ?? 0,
        uniqueColors: domainColorCounts.get(domain)?.size ?? 0,
        files: Array.from(domainFiles.get(domain) ?? []).sort().slice(0, 25),
      };
    });
  const domainMetrics = Object.fromEntries(colorDomains.map(domain => [
    domain.domain,
    {
      colorOccurrences: domain.colorOccurrences,
      uniqueColors: domain.uniqueColors,
    },
  ]));

  return {
    root: normalizePath(root),
    filesScanned,
    ignoredTestFiles,
    ignoredGeneratedFiles,
    filesWithColors,
    colorOccurrences: allColorEntries.length,
    uniqueColors: colorCounts.size,
    colorDomains,
    domainMetrics,
    topColors: topEntries(colorCounts, top),
    topFiles: topEntries(fileColorCounts, top),
    cssVars: {
      definedUnique: definedVars.size,
      usedUnique: usageCounts.size,
      fallbackOccurrences: Array.from(fallbackCounts.values()).reduce((sum, count) => sum + count, 0),
      fallbackUnique: fallbackCounts.size,
      fallbackOnlyUnique: fallbackOnlyVars.length,
      undefinedUnique: undefinedVars.length,
      definedVars: setMapEntries(definitionFiles),
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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStringArray(value, field, failures, { prefix = null, suffix = null } = {}) {
  if (!Array.isArray(value)) {
    failures.push(`${field} must be an array`);
    return [];
  }

  return value.filter((entry, index) => {
    const itemField = `${field}[${index}]`;
    if (typeof entry !== 'string') {
      failures.push(`${itemField} must be a string`);
      return false;
    }
    if (entry.trim().length === 0) {
      failures.push(`${itemField} must be a non-empty string`);
      return false;
    }
    if (prefix && !entry.startsWith(prefix)) {
      failures.push(`${itemField} must start with ${prefix}`);
      return false;
    }
    if (suffix && !entry.endsWith(suffix)) {
      failures.push(`${itemField} must end with ${suffix}`);
      return false;
    }
    return true;
  });
}

export function checkCssVarContract(report, contractPath) {
  if (!contractPath) {
    return [];
  }
  if (!fs.existsSync(contractPath)) {
    return [`${contractPath} does not exist`];
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  } catch (error) {
    return [`${contractPath} must be valid JSON: ${error.message}`];
  }

  const failures = [];
  if (parsed.version !== 1) {
    failures.push(`${contractPath} version must be 1`);
  }
  if (!isNonEmptyString(parsed.description)) {
    failures.push(`${contractPath} description must be a non-empty string`);
  }

  const definedVars = new Set((report.cssVars?.definedVars ?? []).map(entry => entry.key));
  const fallbackOnlyVars = (report.cssVars?.fallbackOnlyVars ?? []).map(entry => entry.key);

  const allowedDynamicPrefixes = validateStringArray(
    parsed.allowedDynamicPrefixes,
    `${contractPath} allowedDynamicPrefixes`,
    failures,
    { prefix: '--', suffix: '-' },
  );
  const legacyAliases = validateStringArray(
    parsed.legacyAliases,
    `${contractPath} legacyAliases`,
    failures,
    { prefix: '--' },
  );
  const fallbackExceptions = validateStringArray(
    parsed.fallbackExceptions,
    `${contractPath} fallbackExceptions`,
    failures,
    { prefix: '--' },
  );
  const allowedMergePolicies = new Set(['same-baseline-no-subtraction', 'separate-report-only']);

  if (parsed.ownedColorDomains !== undefined) {
    if (!Array.isArray(parsed.ownedColorDomains)) {
      failures.push(`${contractPath} ownedColorDomains must be an array`);
    } else {
      const seenOwnedDomains = new Set();
      parsed.ownedColorDomains.forEach((domain, index) => {
        const prefix = `${contractPath} ownedColorDomains[${index}]`;
        if (!domain || typeof domain !== 'object' || Array.isArray(domain)) {
          failures.push(`${prefix} must be an object`);
          return;
        }
        if (!isNonEmptyString(domain.domain)) {
          failures.push(`${prefix}.domain must be a non-empty string`);
        } else {
          if (!/^[a-z0-9-]+$/.test(domain.domain)) {
            failures.push(`${prefix}.domain must be kebab-case`);
          }
          if (/bitfun|canvas/i.test(domain.domain)) {
            failures.push(`${prefix}.domain must be Void-owned and must not use upstream Canvas or BitFun naming`);
          }
          if (seenOwnedDomains.has(domain.domain)) {
            failures.push(`${prefix}.domain duplicates another owned color domain`);
          }
          seenOwnedDomains.add(domain.domain);
        }
        for (const field of ['owner', 'reason', 'mergePolicy']) {
          if (!isNonEmptyString(domain[field])) {
            failures.push(`${prefix}.${field} must be a non-empty string`);
          }
        }
        if (isNonEmptyString(domain.mergePolicy) && !allowedMergePolicies.has(domain.mergePolicy)) {
          failures.push(`${prefix}.mergePolicy must be one of ${Array.from(allowedMergePolicies).join(', ')}`);
        }
        const pathPrefixes = validateStringArray(
          domain.pathPrefixes,
          `${prefix}.pathPrefixes`,
          failures,
        );
        for (const pathPrefix of pathPrefixes) {
          if (/bitfun/i.test(pathPrefix)) {
            failures.push(`${prefix}.pathPrefixes must not reference upstream BitFun paths`);
          }
        }
      });
    }
  }

  if (!Array.isArray(parsed.requiredTokenDomains)) {
    failures.push(`${contractPath} requiredTokenDomains must be an array`);
  } else {
    parsed.requiredTokenDomains.forEach((domain, index) => {
      const prefix = `${contractPath} requiredTokenDomains[${index}]`;
      if (!domain || typeof domain !== 'object' || Array.isArray(domain)) {
        failures.push(`${prefix} must be an object`);
        return;
      }
      if (!isNonEmptyString(domain.domain)) {
        failures.push(`${prefix}.domain must be a non-empty string`);
      }
      const requiredVars = validateStringArray(
        domain.requiredVars,
        `${prefix}.requiredVars`,
        failures,
        { prefix: '--' },
      );
      for (const requiredVar of requiredVars) {
        if (!definedVars.has(requiredVar)) {
          failures.push(`${prefix} required var ${requiredVar} is not defined`);
        }
      }
    });
  }

  const allowedDynamicPrefixSet = new Set(allowedDynamicPrefixes);
  for (const definedVar of definedVars) {
    if (definedVar === '---') {
      continue;
    }
    if (definedVar.endsWith('-') && !allowedDynamicPrefixSet.has(definedVar)) {
      failures.push(`${contractPath} dynamic definition ${definedVar} is not allowed`);
    }
  }

  const allowedFallbacks = new Set([...legacyAliases, ...fallbackExceptions]);
  for (const fallbackVar of fallbackOnlyVars) {
    if (!allowedFallbacks.has(fallbackVar)) {
      failures.push(`${contractPath} fallback-only var ${fallbackVar} is not allowed`);
    }
  }

  return failures;
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

export function checkNearPairDecisions(report, decisionsPath) {
  if (!decisionsPath) {
    return [];
  }
  if (!fs.existsSync(decisionsPath)) {
    return [`${decisionsPath} does not exist`];
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
  } catch (error) {
    return [`${decisionsPath} must be valid JSON: ${error.message}`];
  }

  const failures = [];
  if (parsed.version !== 1) {
    failures.push(`${decisionsPath} version must be 1`);
  }
  if (typeof parsed.description !== 'string' || parsed.description.trim().length === 0) {
    failures.push(`${decisionsPath} description must be a non-empty string`);
  }
  if (!Array.isArray(parsed.decisions)) {
    failures.push(`${decisionsPath} decisions must be an array`);
    return failures;
  }

  const reportedPairs = new Set([
    ...report.nearPairs.indistinguishable.map(pair => pair.key),
    ...report.nearPairs.near.map(pair => pair.key),
  ]);
  const seenKeys = new Set();
  const allowedDecisions = new Set(['keep', 'merge', 'defer']);
  const requiredStringFields = ['root', 'domain', 'key', 'decision', 'owner', 'reason', 'reevaluateWhen'];

  parsed.decisions.forEach((decision, index) => {
    const prefix = `${decisionsPath} decisions[${index}]`;
    if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
      failures.push(`${prefix} must be an object`);
      return;
    }

    for (const field of requiredStringFields) {
      if (typeof decision[field] !== 'string' || decision[field].trim().length === 0) {
        failures.push(`${prefix}.${field} must be a non-empty string`);
      }
    }

    if (typeof decision.decision === 'string' && !allowedDecisions.has(decision.decision)) {
      failures.push(`${prefix}.decision must be one of ${Array.from(allowedDecisions).join(', ')}`);
    }

    if (typeof decision.root === 'string' && normalizePath(decision.root) !== report.root) {
      failures.push(`${prefix}.root must match audited root ${report.root}`);
    }

    if (typeof decision.key === 'string') {
      if (seenKeys.has(decision.key)) {
        failures.push(`${prefix}.key duplicates another near-pair decision`);
      }
      seenKeys.add(decision.key);
      if (!reportedPairs.has(decision.key)) {
        failures.push(`${prefix}.key is not present in the current near-pair report`);
      }
    }
  });

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
    nearPairDecisions: DEFAULT_NEAR_PAIR_DECISIONS,
    cssVarContract: DEFAULT_CSS_VAR_CONTRACT,
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
    } else if (arg === '--near-pair-decisions') {
      options.nearPairDecisions = argv[++index];
      if (!options.nearPairDecisions) {
        throw new Error('--near-pair-decisions requires a path');
      }
    } else if (arg.startsWith('--near-pair-decisions=')) {
      options.nearPairDecisions = arg.slice('--near-pair-decisions='.length);
      if (!options.nearPairDecisions) {
        throw new Error('--near-pair-decisions requires a path');
      }
    } else if (arg === '--no-near-pair-decisions') {
      options.nearPairDecisions = null;
    } else if (arg === '--css-var-contract') {
      options.cssVarContract = argv[++index];
      if (!options.cssVarContract) {
        throw new Error('--css-var-contract requires a path');
      }
    } else if (arg.startsWith('--css-var-contract=')) {
      options.cssVarContract = arg.slice('--css-var-contract='.length);
      if (!options.cssVarContract) {
        throw new Error('--css-var-contract requires a path');
      }
    } else if (arg === '--no-css-var-contract') {
      options.cssVarContract = null;
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
  console.log(`Color domains: ${report.colorDomains.length}`);
  console.log('');
  printRows('Top colors:', report.topColors);
  console.log('');
  printRows('Top files:', report.topFiles);
  console.log('');
  printRows('Color domains:', report.colorDomains.map(domain => ({
    key: `${domain.domain} unique=${domain.uniqueColors} policy=${domain.mergePolicy}`,
    count: domain.colorOccurrences,
  })));
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
  let ownedColorDomains = [];
  if (options.cssVarContract && fs.existsSync(options.cssVarContract)) {
    try {
      const contract = JSON.parse(fs.readFileSync(options.cssVarContract, 'utf8'));
      ownedColorDomains = contract.ownedColorDomains;
    } catch {
      ownedColorDomains = [];
    }
  }
  const report = auditThemeColors({ root: options.root, top: options.top, ownedColorDomains });
  if (options.reportJson) {
    writeReportJson(report, options.reportJson);
  }

  const baselineFailures = checkBaseline(report, options.baseline);
  const nearPairDecisionFailures = checkNearPairDecisions(report, options.nearPairDecisions);
  const cssVarContractFailures = checkCssVarContract(report, options.cssVarContract);
  report.summary.baseline = {
    path: options.baseline,
    enforced: Boolean(options.baseline),
    failures: baselineFailures,
  };
  report.summary.nearPairDecisions = {
    path: options.nearPairDecisions,
    enforced: Boolean(options.nearPairDecisions),
    failures: nearPairDecisionFailures,
  };
  report.summary.cssVarContract = {
    path: options.cssVarContract,
    enforced: Boolean(options.cssVarContract),
    failures: cssVarContractFailures,
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

  if (nearPairDecisionFailures.length > 0) {
    console.error('');
    console.error('Theme near-pair decision failures:');
    for (const failure of nearPairDecisionFailures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }

  if (cssVarContractFailures.length > 0) {
    console.error('');
    console.error('Theme CSS variable contract failures:');
    for (const failure of cssVarContractFailures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
