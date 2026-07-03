import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultContractPath = path.join(__dirname, 'theme-visual-governance-contract.json');

const REQUIRED_SURFACE_KEYS = [
  'app-shell',
  'flow-chat',
  'terminal',
  'markdown-mermaid',
  'generated-widgets',
  'media-short-drama',
  'mobile-web',
  'installer',
];

const ALLOWED_PLATFORMS = new Set([
  'desktop-webview',
  'web',
  'mobile-web',
  'generated-widget',
  'installer',
]);
const ALLOWED_FORM_FACTORS = new Set(['desktop', 'narrow', 'mobile', 'iframe']);
const ALLOWED_THEMES = new Set(['dark', 'light', 'system']);
const ALLOWED_EVIDENCE_TYPES = new Set([
  'boundary-render-review',
  'contrast-review',
  'focused-visual-review',
  'mobile-build-review',
  'theme-color-audit',
]);
const ALLOWED_EVIDENCE_MODES = new Set(['automated', 'manual', 'deferred']);

const prohibitedIdentityPatterns = [
  ['Bit', 'Fun'].join(''),
  ['bit', 'fun'].join(''),
  ['BIT', 'FUN'].join(''),
  ['GC', 'Wing'].join(''),
  ['__BIT', 'FUN'].join(''),
  ['BIT', 'FUN_'].join(''),
  ['--bit', 'fun'].join(''),
];

function parseArgs(argv) {
  const contractIndex = argv.indexOf('--contract');
  return {
    json: argv.includes('--json'),
    contractPath: contractIndex >= 0 ? path.resolve(argv[contractIndex + 1] || '') : defaultContractPath,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function addStringFailure(value, pathLabel, failures) {
  if (!isNonEmptyString(value)) {
    failures.push(`${pathLabel} must be a non-empty string`);
  }
}

function validateStringArray(value, pathLabel, failures, options = {}) {
  const { allowedValues, minLength = 1, pathMustExist = false } = options;
  if (!Array.isArray(value)) {
    failures.push(`${pathLabel} must be an array`);
    return;
  }
  if (value.length < minLength) {
    failures.push(`${pathLabel} must contain at least ${minLength} item(s)`);
    return;
  }

  const seen = new Set();
  value.forEach((entry, index) => {
    const entryPath = `${pathLabel}[${index}]`;
    if (!isNonEmptyString(entry)) {
      failures.push(`${entryPath} must be a non-empty string`);
      return;
    }
    if (seen.has(entry)) {
      failures.push(`${entryPath} duplicates ${entry}`);
    }
    seen.add(entry);
    if (allowedValues && !allowedValues.has(entry)) {
      failures.push(`${entryPath} has unsupported value ${entry}`);
    }
    if (pathMustExist && !fs.existsSync(path.join(repoRoot, entry))) {
      failures.push(`${entryPath} does not exist: ${entry}`);
    }
  });
}

function validateEvidence(surface, failures) {
  const pathLabel = `surfaces.${surface.key || '<missing-key>'}.evidence`;
  if (!Array.isArray(surface.evidence) || surface.evidence.length === 0) {
    failures.push(`${pathLabel} must contain at least one evidence requirement`);
    return;
  }

  let hasActionableEvidence = false;
  surface.evidence.forEach((entry, index) => {
    const entryPath = `${pathLabel}[${index}]`;
    if (!isPlainObject(entry)) {
      failures.push(`${entryPath} must be an object`);
      return;
    }

    addStringFailure(entry.type, `${entryPath}.type`, failures);
    if (isNonEmptyString(entry.type) && !ALLOWED_EVIDENCE_TYPES.has(entry.type)) {
      failures.push(`${entryPath}.type has unsupported value ${entry.type}`);
    }
    addStringFailure(entry.mode, `${entryPath}.mode`, failures);
    if (isNonEmptyString(entry.mode) && !ALLOWED_EVIDENCE_MODES.has(entry.mode)) {
      failures.push(`${entryPath}.mode has unsupported value ${entry.mode}`);
    }
    addStringFailure(entry.theme, `${entryPath}.theme`, failures);
    addStringFailure(entry.viewport, `${entryPath}.viewport`, failures);
    addStringFailure(entry.state, `${entryPath}.state`, failures);
    addStringFailure(entry.requirement, `${entryPath}.requirement`, failures);

    if (isNonEmptyString(entry.command)) {
      hasActionableEvidence = true;
    }
    if (isNonEmptyString(entry.artifactName)) {
      hasActionableEvidence = true;
    }
    if (!isNonEmptyString(entry.command) && !isNonEmptyString(entry.artifactName)) {
      failures.push(`${entryPath} must declare command or artifactName`);
    }
    if (entry.type === 'boundary-render-review' || entry.type === 'mobile-build-review') {
      hasActionableEvidence = true;
    }
  });

  if (!hasActionableEvidence) {
    failures.push(`${pathLabel} must include command-backed or boundary-specific evidence`);
  }
}

function validateSurface(surface, index, failures) {
  const pathLabel = `surfaces[${index}]`;
  if (!isPlainObject(surface)) {
    failures.push(`${pathLabel} must be an object`);
    return;
  }

  addStringFailure(surface.key, `${pathLabel}.key`, failures);
  if (isNonEmptyString(surface.key) && !/^[a-z0-9-]+$/.test(surface.key)) {
    failures.push(`${pathLabel}.key must be kebab-case`);
  }
  addStringFailure(surface.label, `${pathLabel}.label`, failures);
  addStringFailure(surface.owner, `${pathLabel}.owner`, failures);
  if (isNonEmptyString(surface.owner) && !surface.owner.includes('src')) {
    failures.push(`${pathLabel}.owner must point to a source-owned boundary`);
  }

  validateStringArray(surface.requiredPaths, `${pathLabel}.requiredPaths`, failures, {
    minLength: 1,
    pathMustExist: true,
  });
  validateStringArray(surface.platforms, `${pathLabel}.platforms`, failures, {
    allowedValues: ALLOWED_PLATFORMS,
  });
  validateStringArray(surface.formFactors, `${pathLabel}.formFactors`, failures, {
    allowedValues: ALLOWED_FORM_FACTORS,
  });
  validateStringArray(surface.themes, `${pathLabel}.themes`, failures, {
    allowedValues: ALLOWED_THEMES,
    minLength: 2,
  });
  if (Array.isArray(surface.themes)) {
    for (const requiredTheme of ['dark', 'light']) {
      if (!surface.themes.includes(requiredTheme)) {
        failures.push(`${pathLabel}.themes must include ${requiredTheme}`);
      }
    }
  }
  validateStringArray(surface.states, `${pathLabel}.states`, failures, { minLength: 3 });
  validateStringArray(surface.tokenFamilies, `${pathLabel}.tokenFamilies`, failures, { minLength: 2 });
  validateStringArray(surface.protectedContracts, `${pathLabel}.protectedContracts`, failures, {
    minLength: 2,
  });
  validateStringArray(surface.risks, `${pathLabel}.risks`, failures, { minLength: 2 });
  validateEvidence(surface, failures);
}

function validateIdentity(text, failures) {
  for (const pattern of prohibitedIdentityPatterns) {
    if (text.includes(pattern)) {
      failures.push(`contract must not contain upstream identity pattern: ${pattern}`);
    }
  }
}

function readContract(nextContractPath) {
  const contractPath = nextContractPath || defaultContractPath;
  const text = fs.readFileSync(contractPath, 'utf8');
  return {
    text,
    contract: JSON.parse(text),
  };
}

function validateContract(contract, text) {
  const failures = [];
  if (!isPlainObject(contract)) {
    return ['theme visual governance contract must be an object'];
  }

  if (contract.version !== 1) {
    failures.push('version must be 1');
  }
  if (contract.product !== 'Void') {
    failures.push('product must be Void');
  }
  addStringFailure(contract.description, 'description', failures);
  validateIdentity(text, failures);

  if (!Array.isArray(contract.surfaces)) {
    failures.push('surfaces must be an array');
    return failures;
  }

  const surfaceKeys = new Set();
  contract.surfaces.forEach((surface, index) => {
    validateSurface(surface, index, failures);
    if (isNonEmptyString(surface?.key)) {
      if (surfaceKeys.has(surface.key)) {
        failures.push(`surfaces[${index}].key duplicates ${surface.key}`);
      }
      surfaceKeys.add(surface.key);
    }
  });

  for (const requiredKey of REQUIRED_SURFACE_KEYS) {
    if (!surfaceKeys.has(requiredKey)) {
      failures.push(`surfaces is missing required surface ${requiredKey}`);
    }
  }

  return failures;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;

  try {
    const { contract, text } = readContract(args.contractPath);
    const failures = validateContract(contract, text);
    result = {
      ok: failures.length === 0,
      failures,
      surfaceCount: Array.isArray(contract.surfaces) ? contract.surfaces.length : 0,
      requiredSurfaceCount: REQUIRED_SURFACE_KEYS.length,
    };
  } catch (error) {
    result = {
      ok: false,
      failures: [`failed to read visual governance contract: ${error.message}`],
      surfaceCount: 0,
      requiredSurfaceCount: REQUIRED_SURFACE_KEYS.length,
    };
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(
      `Theme visual governance contract: ${result.surfaceCount} surfaces, ` +
        `${result.requiredSurfaceCount} required surfaces covered.`
    );
  } else {
    console.error('Theme visual governance contract failed:');
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main();
