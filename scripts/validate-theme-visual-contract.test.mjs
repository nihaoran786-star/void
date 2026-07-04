import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const contractPath = path.join(root, 'scripts/theme-visual-governance-contract.json');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runValidator(args = []) {
  return spawnSync(process.execPath, ['scripts/validate-theme-visual-contract.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function readCurrentContract() {
  return JSON.parse(fs.readFileSync(contractPath, 'utf8'));
}

test('current visual governance evidence declares review metadata', () => {
  const contract = readCurrentContract();

  for (const surface of contract.surfaces) {
    for (const evidence of surface.evidence) {
      assert.match(evidence.mode, /^(automated|manual|deferred)$/);
      assert.ok(evidence.theme, `${surface.key} evidence must declare theme`);
      assert.ok(evidence.viewport, `${surface.key} evidence must declare viewport`);
      assert.ok(evidence.state, `${surface.key} evidence must declare state`);
      assert.ok(
        evidence.command || evidence.artifactName,
        `${surface.key} evidence must declare command or artifactName`,
      );
    }
  }
});

test('validator rejects unknown evidence modes and missing metadata from supplied contracts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'void-theme-visual-contract-'));
  try {
    const contract = readCurrentContract();
    contract.surfaces[0].evidence[0] = {
      type: 'theme-color-audit',
      mode: 'robot',
      requirement: 'fixture requirement',
    };
    const fixturePath = path.join(tempDir, 'contract.json');
    writeJson(fixturePath, contract);

    const result = runValidator(['--contract', fixturePath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /evidence\[0\]\.mode has unsupported value robot/);
    assert.match(result.stderr, /evidence\[0\]\.theme must be a non-empty string/);
    assert.match(result.stderr, /evidence\[0\]\.viewport must be a non-empty string/);
    assert.match(result.stderr, /evidence\[0\]\.state must be a non-empty string/);
    assert.match(result.stderr, /evidence\[0\] must declare command or artifactName/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('validator rejects unknown evidence types and upstream branding from supplied contracts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'void-theme-visual-contract-'));
  const legacyBrandTitle = `Bit${'Fun'}`;
  try {
    const contract = readCurrentContract();
    contract.description = `${legacyBrandTitle} fixture`;
    contract.surfaces[0].evidence[0] = {
      type: 'screenshot-proof',
      mode: 'manual',
      theme: 'dark',
      viewport: 'desktop',
      state: 'default',
      artifactName: 'fixture.png',
      requirement: 'fixture requirement',
    };
    const fixturePath = path.join(tempDir, 'contract.json');
    writeJson(fixturePath, contract);

    const result = runValidator(['--contract', fixturePath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`contract must not contain upstream identity pattern: ${legacyBrandTitle}`));
    assert.match(result.stderr, /evidence\[0\]\.type has unsupported value screenshot-proof/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
