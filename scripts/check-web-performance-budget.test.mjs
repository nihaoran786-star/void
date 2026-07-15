import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	checkWebPerformanceBudget,
	collectStaticClosure,
	evaluatePerformanceBudget,
	parseBuildWarnings,
	validateBudgetConfig,
} from './check-web-performance-budget.mjs';

const DYNAMIC_ENTRY = 'src/lazy.ts';
const CSS_MARKERS = [
	'.monaco-editor',
	'.xterm-helper-textarea',
	'.katex',
	'.void-ai-model-config',
	'.workspace-media-gallery',
	'.short-drama-center',
];

const defaultManifest = () => ({
	'index.html': {
		file: 'assets/index.js',
		isEntry: true,
		imports: ['src/shared.ts'],
		dynamicImports: [DYNAMIC_ENTRY],
		css: ['assets/index.css'],
	},
	'src/shared.ts': {
		file: 'assets/shared.js',
		imports: [],
		css: ['assets/shared.css'],
	},
	[DYNAMIC_ENTRY]: {
		file: 'assets/lazy.js',
		isDynamicEntry: true,
		imports: [],
		dynamicImports: [],
		css: ['assets/lazy.css'],
	},
});

const defaultBudget = () => ({
	version: 1,
	entry: { manifestKey: 'index.html' },
	javascript: {
		maxRawBytes: 10_000,
		referenceGzipBytes: 10_000,
		forbiddenMarkers: ['MonacoEnvironment'],
	},
	css: {
		maxRawBytes: 10_000,
		referenceGzipBytes: 10_000,
		forbiddenMarkers: CSS_MARKERS,
	},
	requiredDynamicEntries: [DYNAMIC_ENTRY],
	staticGraph: {
		externalUnreachable: ['monaco-editor'],
		localUnreachable: ['src/lazy.ts'],
	},
});

const defaultFiles = () => ({
	'assets/index.js': 'main',
	'assets/shared.js': 'shared',
	'assets/lazy.js': `lazy-${'x'.repeat(20_000)}-MonacoEnvironment`,
	'assets/index.css': 'body{}',
	'assets/shared.css': '.shared{}',
	'assets/lazy.css': CSS_MARKERS.join('\n'),
});

async function createFixture(t, options = {}) {
	const root = await mkdtemp(path.join(tmpdir(), 'web-performance-budget-'));
	t.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const distDir = path.join(root, 'dist');
	const budgetPath = path.join(root, 'budget.json');
	const buildLogPath = path.join(root, 'build.log');
	await mkdir(path.join(distDir, '.vite'), { recursive: true });

	const manifest = options.manifest ?? defaultManifest();
	const budget = options.budget ?? defaultBudget();
	const files = { ...defaultFiles(), ...options.files };
	for (const missingFile of options.missingFiles ?? []) {
		delete files[missingFile];
	}

	if (!options.omitManifest) {
		await writeFile(
			path.join(distDir, '.vite', 'manifest.json'),
			JSON.stringify(manifest),
		);
	}
	await writeFile(budgetPath, JSON.stringify(budget));
	for (const [relativePath, content] of Object.entries(files)) {
		const outputPath = path.join(distDir, relativePath);
		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeFile(outputPath, content);
	}
	if (options.buildLog !== undefined) {
		await writeFile(buildLogPath, options.buildLog);
	}

	return {
		root,
		distDir,
		budgetPath,
		buildLogPath: options.buildLog === undefined ? undefined : buildLogPath,
	};
}

const graphResult = (overrides = {}) => ({
	status: 0,
	stdout: JSON.stringify({ unresolved: [] }),
	stderr: '',
	...overrides,
});

async function runFixture(fixture, graphRunner = () => graphResult()) {
	return checkWebPerformanceBudget({
		distDir: fixture.distDir,
		budgetPath: fixture.budgetPath,
		buildLogPath: fixture.buildLogPath,
		graphRunner,
		cwd: fixture.root,
	});
}

function evaluateManifest(manifest) {
	return evaluatePerformanceBudget({
		budget: defaultBudget(),
		manifest,
		assetContents: {
			javascript: new Map([
				['assets/index.js', Buffer.from('main')],
				['assets/shared.js', Buffer.from('shared')],
			]),
			css: new Map([
				['assets/index.css', Buffer.from('body{}')],
				['assets/shared.css', Buffer.from('.shared{}')],
			]),
		},
	});
}

test('healthy fixture passes and forwards every static graph assertion', async (t) => {
	const fixture = await createFixture(t);
	let invocation;
	const result = await runFixture(fixture, (value) => {
		invocation = value;
		return graphResult();
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.staticAssets.javascript, [
		'assets/index.js',
		'assets/shared.js',
	]);
	assert.ok(invocation.args.includes('--json'));
	assert.ok(
		invocation.args.includes('--assert-external-unreachable=monaco-editor'),
	);
	assert.ok(
		invocation.args.includes(
			'--assert-local-prefix-unreachable=src/lazy.ts',
		),
	);
});

test('raw byte totals equal to both limits pass', async (t) => {
	const budget = defaultBudget();
	budget.javascript.maxRawBytes = 10;
	budget.css.maxRawBytes = 15;
	const result = await runFixture(await createFixture(t, { budget }));

	assert.equal(result.ok, true);
	assert.equal(result.metrics.javascript.rawBytes, 10);
	assert.equal(result.metrics.css.rawBytes, 15);
});

test('JavaScript exceeding the raw limit by one byte fails', async (t) => {
	const budget = defaultBudget();
	budget.javascript.maxRawBytes = 9;
	const result = await runFixture(await createFixture(t, { budget }));

	assert.equal(result.ok, false);
	assert.ok(result.failures.some(({ code }) => code === 'javascript-raw-budget'));
});

test('CSS exceeding the raw limit by one byte fails', async (t) => {
	const budget = defaultBudget();
	budget.css.maxRawBytes = 14;
	const result = await runFixture(await createFixture(t, { budget }));

	assert.equal(result.ok, false);
	assert.ok(result.failures.some(({ code }) => code === 'css-raw-budget'));
});

test('missing Vite manifest fails with a useful error', async (t) => {
	const fixture = await createFixture(t, { omitManifest: true });
	await assert.rejects(runFixture(fixture), /Vite manifest/i);
});

test('missing emitted asset fails with a useful error', async (t) => {
	const fixture = await createFixture(t, {
		missingFiles: ['assets/shared.js'],
	});
	await assert.rejects(runFixture(fixture), /emitted asset.*shared\.js/i);
});

test('recursive static imports are traversed and shared assets are deduplicated', async (t) => {
	const manifest = defaultManifest();
	manifest['index.html'].imports = ['src/a.ts', 'src/b.ts'];
	manifest['src/a.ts'] = {
		file: 'assets/a.js',
		imports: ['src/shared.ts'],
	};
	manifest['src/b.ts'] = {
		file: 'assets/b.js',
		imports: ['src/shared.ts'],
	};
	const files = {
		'assets/a.js': 'a',
		'assets/b.js': 'bb',
	};
	const fixture = await createFixture(t, { manifest, files });
	const result = await runFixture(fixture);

	assert.deepEqual(collectStaticClosure(manifest, 'index.html'), [
		'index.html',
		'src/a.ts',
		'src/shared.ts',
		'src/b.ts',
	]);
	assert.equal(result.metrics.javascript.rawBytes, 4 + 1 + 2 + 6);
	assert.equal(
		result.staticAssets.javascript.filter((file) => file === 'assets/shared.js')
			.length,
		1,
	);
});

test('dynamic chunks and their markers do not count toward the entry budget', async (t) => {
	const fixture = await createFixture(t);
	const result = await runFixture(fixture);

	assert.equal(result.metrics.javascript.rawBytes, 10);
	assert.equal(result.metrics.css.rawBytes, 15);
	assert.equal(result.markers.javascript.length, 0);
	assert.equal(result.markers.css.length, 0);
});

test('a forbidden JavaScript marker in the static closure fails', async (t) => {
	const fixture = await createFixture(t, {
		files: { 'assets/index.js': 'MonacoEnvironment' },
	});
	const result = await runFixture(fixture);

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some(
			({ code, marker }) =>
				code === 'forbidden-static-marker' && marker === 'MonacoEnvironment',
		),
	);
});

for (const marker of CSS_MARKERS) {
	test(`forbidden CSS marker ${marker} in the static closure fails`, async (t) => {
		const fixture = await createFixture(t, {
			files: { 'assets/index.css': marker },
		});
		const result = await runFixture(fixture);

		assert.equal(result.ok, false);
		assert.ok(
			result.failures.some(
				(failure) =>
					failure.code === 'forbidden-static-marker' &&
					failure.marker === marker,
			),
		);
	});
}

test('a missing required dynamic manifest key fails', async (t) => {
	const manifest = defaultManifest();
	delete manifest[DYNAMIC_ENTRY];
	const result = await runFixture(await createFixture(t, { manifest }));

	assert.equal(result.ok, false);
	assert.ok(result.failures.some(({ code }) => code === 'dynamic-entry-missing'));
});

test('the configured entry must have isEntry true', () => {
	const manifest = defaultManifest();
	manifest['index.html'].isEntry = false;
	const result = evaluateManifest(manifest);

	assert.equal(result.ok, undefined);
	assert.ok(result.failures.some(({ code }) => code === 'entry-not-entry'));
});

test('a required dynamic key without isDynamicEntry true fails', async (t) => {
	const manifest = defaultManifest();
	manifest[DYNAMIC_ENTRY].isDynamicEntry = false;
	const result = await runFixture(await createFixture(t, { manifest }));

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some(({ code }) => code === 'dynamic-entry-not-flagged'),
	);
});

test('a required dynamic entry without a file fails pure analysis', () => {
	const manifest = defaultManifest();
	delete manifest[DYNAMIC_ENTRY].file;
	const result = evaluateManifest(manifest);

	assert.ok(
		result.failures.some(({ code }) => code === 'dynamic-entry-file-missing'),
	);
});

test('a required dynamic entry with an empty file fails pure analysis', () => {
	const manifest = defaultManifest();
	manifest[DYNAMIC_ENTRY].file = '   ';
	const result = evaluateManifest(manifest);

	assert.ok(
		result.failures.some(({ code }) => code === 'dynamic-entry-file-missing'),
	);
});

test('a required dynamic entry cannot share a static JavaScript file', () => {
	const manifest = defaultManifest();
	manifest[DYNAMIC_ENTRY].file = 'assets/index.js';
	const result = evaluateManifest(manifest);

	assert.ok(
		result.failures.some(
			({ code }) => code === 'dynamic-entry-shares-static-file',
		),
	);
});

test('a required dynamic entry cannot alias a static JavaScript file', async (t) => {
	const manifest = defaultManifest();
	manifest[DYNAMIC_ENTRY].file = 'assets/../assets/index.js';
	const result = await runFixture(await createFixture(t, { manifest }));

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some(
			({ code }) => code === 'dynamic-entry-shares-static-file',
		),
	);
});

test('a missing dynamic entry file is a structured gate failure', async (t) => {
	const fixture = await createFixture(t, {
		missingFiles: ['assets/lazy.js'],
	});
	const result = await runFixture(fixture);

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some(
			({ code, file }) =>
				code === 'dynamic-entry-file-unreadable' && file === 'assets/lazy.js',
		),
	);
});

test('an unreachable required dynamic key fails', async (t) => {
	const manifest = defaultManifest();
	manifest['index.html'].dynamicImports = [];
	const result = await runFixture(await createFixture(t, { manifest }));

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some(({ code }) => code === 'dynamic-entry-unreachable'),
	);
});

test('a required dynamic key in the static closure fails', async (t) => {
	const manifest = defaultManifest();
	manifest['index.html'].imports.push(DYNAMIC_ENTRY);
	const result = await runFixture(await createFixture(t, { manifest }));

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some(({ code }) => code === 'dynamic-entry-statically-reachable'),
	);
});

test('a non-zero static graph runner exit fails', async (t) => {
	const fixture = await createFixture(t);
	const result = await runFixture(fixture, () =>
		graphResult({ status: 2, stderr: 'assertion failed' }),
	);

	assert.equal(result.ok, false);
	assert.ok(result.failures.some(({ code }) => code === 'static-graph-exit'));
});

test('non-empty unresolved static graph imports fail', async (t) => {
	const fixture = await createFixture(t);
	const result = await runFixture(fixture, () =>
		graphResult({
			stdout: JSON.stringify({
				unresolved: [{ importer: 'src/a.ts', specifier: './missing' }],
			}),
		}),
	);

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some(({ code }) => code === 'static-graph-unresolved'),
	);
});

test('known Vite warnings are classified without failing the gate', async (t) => {
	const buildLog = [
		'(!) src/lazy.ts is dynamically imported by src/main.ts but also statically imported by src/other.ts',
		'(!) Some chunks are larger than 500 kB after minification. Consider:',
	].join('\n');
	const fixture = await createFixture(t, { buildLog });
	const result = await runFixture(fixture);

	assert.equal(result.ok, true);
	assert.deepEqual(
		result.buildWarnings.map(({ type }) => type),
		['mixed-static-dynamic', 'oversized-chunk'],
	);
	assert.deepEqual(
		parseBuildWarnings(buildLog).map(({ type }) => type),
		['mixed-static-dynamic', 'oversized-chunk'],
	);
});

test('an unknown (!) build warning fails the gate', async (t) => {
	const fixture = await createFixture(t, {
		buildLog: '(!) Broken source map for src/main.ts',
	});
	const result = await runFixture(fixture);

	assert.equal(result.ok, false);
	assert.ok(result.failures.some(({ code }) => code === 'unknown-build-warning'));
});

test('gzip reference overruns are reported but do not fail', async (t) => {
	const budget = defaultBudget();
	budget.javascript.referenceGzipBytes = 0;
	budget.css.referenceGzipBytes = 0;
	const result = await runFixture(await createFixture(t, { budget }));

	assert.equal(result.ok, true);
	assert.ok(result.metrics.javascript.gzipDeltaBytes > 0);
	assert.ok(result.metrics.css.gzipDeltaBytes > 0);
	assert.equal(
		result.warnings.filter(({ code }) => code === 'gzip-reference-exceeded')
			.length,
		2,
	);
});

test('invalid budget configuration is rejected before checking files', async (t) => {
	const budget = defaultBudget();
	budget.javascript.maxRawBytes = -1;
	const fixture = await createFixture(t, { budget });

	assert.throws(() => validateBudgetConfig(budget), /maxRawBytes/i);
	await assert.rejects(runFixture(fixture), /maxRawBytes/i);
});

test('budget configuration requires version 1', () => {
	const budget = defaultBudget();
	delete budget.version;

	assert.throws(() => validateBudgetConfig(budget), /version must be 1/i);
});

test('budget configuration rejects unsupported versions', () => {
	const budget = defaultBudget();
	budget.version = 2;

	assert.throws(() => validateBudgetConfig(budget), /version must be 1/i);
});

test('budget configuration rejects unknown top-level fields', () => {
	const budget = defaultBudget();
	budget.unexpected = true;

	assert.throws(
		() => validateBudgetConfig(budget),
		/unknown top-level field "unexpected"/i,
	);
});
