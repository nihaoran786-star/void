import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultBudgetPath = path.join(scriptDirectory, 'web-performance-budget.json');
const staticGraphScriptPath = path.join(
	scriptDirectory,
	'report-web-main-static-graph.cjs',
);

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, field) {
	if (!isObject(value)) {
		throw new Error(`Invalid performance budget: ${field} must be an object`);
	}
}

function assertNonEmptyString(value, field) {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(
			`Invalid performance budget: ${field} must be a non-empty string`,
		);
	}
}

function assertNonNegativeInteger(value, field) {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(
			`Invalid performance budget: ${field} must be a non-negative integer`,
		);
	}
}

function assertStringArray(value, field, { allowEmpty = true } = {}) {
	if (
		!Array.isArray(value) ||
		(!allowEmpty && value.length === 0) ||
		value.some((item) => typeof item !== 'string' || item.trim() === '')
	) {
		throw new Error(
			`Invalid performance budget: ${field} must be ${
				allowEmpty ? 'an' : 'a non-empty'
			} array of non-empty strings`,
		);
	}

	if (new Set(value).size !== value.length) {
		throw new Error(
			`Invalid performance budget: ${field} must not contain duplicates`,
		);
	}
}

/**
 * Validates the JSON-compatible budget object without mutating it.
 */
export function validateBudgetConfig(budget) {
	assertObject(budget, 'root');
	if (budget.version !== 1) {
		throw new Error('Invalid performance budget: version must be 1');
	}

	const allowedTopLevelFields = new Set([
		'version',
		'entry',
		'javascript',
		'css',
		'requiredDynamicEntries',
		'staticGraph',
	]);
	for (const field of Object.keys(budget)) {
		if (!allowedTopLevelFields.has(field)) {
			throw new Error(
				`Invalid performance budget: unknown top-level field "${field}"`,
			);
		}
	}

	assertObject(budget.entry, 'entry');
	assertNonEmptyString(budget.entry.manifestKey, 'entry.manifestKey');

	for (const assetType of ['javascript', 'css']) {
		const assetBudget = budget[assetType];
		assertObject(assetBudget, assetType);
		assertNonNegativeInteger(
			assetBudget.maxRawBytes,
			`${assetType}.maxRawBytes`,
		);
		assertNonNegativeInteger(
			assetBudget.referenceGzipBytes,
			`${assetType}.referenceGzipBytes`,
		);
		assertStringArray(
			assetBudget.forbiddenMarkers,
			`${assetType}.forbiddenMarkers`,
		);
	}

	assertStringArray(
		budget.requiredDynamicEntries,
		'requiredDynamicEntries',
		{ allowEmpty: false },
	);
	assertObject(budget.staticGraph, 'staticGraph');
	assertStringArray(
		budget.staticGraph.externalUnreachable,
		'staticGraph.externalUnreachable',
	);
	assertStringArray(
		budget.staticGraph.localUnreachable,
		'staticGraph.localUnreachable',
	);

	return budget;
}

function importsFor(manifestEntry, field, manifestKey) {
	const imports = manifestEntry[field];
	if (imports === undefined) {
		return [];
	}
	if (!Array.isArray(imports) || imports.some((item) => typeof item !== 'string')) {
		throw new Error(
			`Invalid Vite manifest entry "${manifestKey}": ${field} must be an array of strings`,
		);
	}
	return imports;
}

/**
 * Returns manifest keys in deterministic depth-first order, following only
 * static imports. Dynamic imports are intentionally excluded from this set.
 */
export function collectStaticClosure(manifest, entryKey) {
	assertObject(manifest, 'Vite manifest');
	assertNonEmptyString(entryKey, 'entry manifest key');

	const closure = [];
	const seen = new Set();

	function visit(manifestKey, importer) {
		if (seen.has(manifestKey)) {
			return;
		}

		const manifestEntry = manifest[manifestKey];
		if (!isObject(manifestEntry)) {
			const context = importer ? ` imported by "${importer}"` : '';
			throw new Error(
				`Vite manifest entry "${manifestKey}"${context} is missing`,
			);
		}

		seen.add(manifestKey);
		closure.push(manifestKey);
		for (const importedKey of importsFor(
			manifestEntry,
			'imports',
			manifestKey,
		)) {
			visit(importedKey, manifestKey);
		}
	}

	visit(entryKey);
	return closure;
}

/**
 * Returns every key reachable after crossing at least one dynamic-import edge.
 * Static descendants of a dynamically loaded chunk remain dynamically reachable.
 */
export function collectDynamicReachable(manifest, entryKey, staticClosure) {
	const staticKeys = staticClosure ?? collectStaticClosure(manifest, entryKey);
	const queue = [];
	const reachable = [];
	const seen = new Set();

	for (const manifestKey of staticKeys) {
		const manifestEntry = manifest[manifestKey];
		for (const importedKey of importsFor(
			manifestEntry,
			'dynamicImports',
			manifestKey,
		)) {
			queue.push(importedKey);
		}
	}

	while (queue.length > 0) {
		const manifestKey = queue.shift();
		if (seen.has(manifestKey)) {
			continue;
		}

		seen.add(manifestKey);
		reachable.push(manifestKey);
		const manifestEntry = manifest[manifestKey];
		if (!isObject(manifestEntry)) {
			continue;
		}

		for (const field of ['imports', 'dynamicImports']) {
			for (const importedKey of importsFor(
				manifestEntry,
				field,
				manifestKey,
			)) {
				queue.push(importedKey);
			}
		}
	}

	return reachable;
}

/**
 * Maps the static manifest closure to emitted JavaScript and CSS files.
 */
export function collectStaticAssets(manifest, staticClosure) {
	const javascript = [];
	const css = [];
	const javascriptSeen = new Set();
	const cssSeen = new Set();

	for (const manifestKey of staticClosure) {
		const manifestEntry = manifest[manifestKey];
		const emittedFile = manifestEntry.file;
		assertNonEmptyString(
			emittedFile,
			`Vite manifest entry "${manifestKey}".file`,
		);

		if (emittedFile.toLowerCase().endsWith('.css')) {
			if (!cssSeen.has(emittedFile)) {
				cssSeen.add(emittedFile);
				css.push(emittedFile);
			}
		} else if (!javascriptSeen.has(emittedFile)) {
			javascriptSeen.add(emittedFile);
			javascript.push(emittedFile);
		}

		const cssFiles = manifestEntry.css ?? [];
		if (
			!Array.isArray(cssFiles) ||
			cssFiles.some((item) => typeof item !== 'string')
		) {
			throw new Error(
				`Invalid Vite manifest entry "${manifestKey}": css must be an array of strings`,
			);
		}
		for (const cssFile of cssFiles) {
			if (!cssSeen.has(cssFile)) {
				cssSeen.add(cssFile);
				css.push(cssFile);
			}
		}
	}

	return { javascript, css };
}

function measureAssets(assetFiles, assetContents) {
	let rawBytes = 0;
	let gzipBytes = 0;
	for (const assetFile of assetFiles) {
		const contents = assetContents.get(assetFile);
		if (!Buffer.isBuffer(contents)) {
			throw new Error(`Missing in-memory contents for emitted asset "${assetFile}"`);
		}
		rawBytes += contents.byteLength;
		gzipBytes += gzipSync(contents).byteLength;
	}
	return { rawBytes, gzipBytes };
}

function findForbiddenMarkers(assetType, assetFiles, assetContents, markers) {
	const matches = [];
	for (const assetFile of assetFiles) {
		const contents = assetContents.get(assetFile);
		for (const marker of markers) {
			if (contents.includes(Buffer.from(marker))) {
				matches.push({ assetType, file: assetFile, marker });
			}
		}
	}
	return matches;
}

/**
 * Classifies Vite warning lines. Only lines containing the Vite `(!)` marker
 * are warnings for this gate; ordinary build-log output is ignored.
 */
export function parseBuildWarnings(buildLog = '') {
	if (typeof buildLog !== 'string') {
		throw new TypeError('buildLog must be a string');
	}

	const warnings = [];
	for (const line of buildLog.split(/\r?\n/u)) {
		const markerIndex = line.indexOf('(!)');
		if (markerIndex === -1) {
			continue;
		}

		const message = line.slice(markerIndex).trim();
		let type = 'unknown';
		if (
			/dynamically imported.+but also statically imported/iu.test(message)
		) {
			type = 'mixed-static-dynamic';
		} else if (/Some chunks are larger/iu.test(message)) {
			type = 'oversized-chunk';
		}
		warnings.push({ type, message });
	}

	return warnings;
}

function metricFor(measurement, assetBudget) {
	return {
		rawBytes: measurement.rawBytes,
		maxRawBytes: assetBudget.maxRawBytes,
		rawDeltaBytes: measurement.rawBytes - assetBudget.maxRawBytes,
		withinRawBudget: measurement.rawBytes <= assetBudget.maxRawBytes,
		gzipBytes: measurement.gzipBytes,
		referenceGzipBytes: assetBudget.referenceGzipBytes,
		gzipDeltaBytes:
			measurement.gzipBytes - assetBudget.referenceGzipBytes,
	};
}

/**
 * Pure analysis of a parsed manifest and already-loaded static asset buffers.
 */
export function evaluatePerformanceBudget({
	budget,
	manifest,
	assetContents,
	buildLog = '',
}) {
	validateBudgetConfig(budget);
	const entryKey = budget.entry.manifestKey;
	const staticClosure = collectStaticClosure(manifest, entryKey);
	const staticClosureSet = new Set(staticClosure);
	const dynamicReachable = collectDynamicReachable(
		manifest,
		entryKey,
		staticClosure,
	);
	const dynamicReachableSet = new Set(dynamicReachable);
	const staticAssets = collectStaticAssets(manifest, staticClosure);
	const measurements = {
		javascript: measureAssets(
			staticAssets.javascript,
			assetContents.javascript,
		),
		css: measureAssets(staticAssets.css, assetContents.css),
	};
	const metrics = {
		javascript: metricFor(measurements.javascript, budget.javascript),
		css: metricFor(measurements.css, budget.css),
	};
	const markers = {
		javascript: findForbiddenMarkers(
			'javascript',
			staticAssets.javascript,
			assetContents.javascript,
			budget.javascript.forbiddenMarkers,
		),
		css: findForbiddenMarkers(
			'css',
			staticAssets.css,
			assetContents.css,
			budget.css.forbiddenMarkers,
		),
	};
	const failures = [];
	const warnings = [];
	if (manifest[entryKey].isEntry !== true) {
		failures.push({
			code: 'entry-not-entry',
			key: entryKey,
			message: `Configured entry "${entryKey}" does not have isEntry: true`,
		});
	}

	for (const assetType of ['javascript', 'css']) {
		const metric = metrics[assetType];
		if (!metric.withinRawBudget) {
			failures.push({
				code: `${assetType}-raw-budget`,
				assetType,
				actualBytes: metric.rawBytes,
				limitBytes: metric.maxRawBytes,
				message: `${assetType} raw size ${metric.rawBytes} exceeds ${metric.maxRawBytes} bytes`,
			});
		}
		if (metric.gzipDeltaBytes > 0) {
			warnings.push({
				code: 'gzip-reference-exceeded',
				assetType,
				actualBytes: metric.gzipBytes,
				referenceBytes: metric.referenceGzipBytes,
				message: `${assetType} gzip size ${metric.gzipBytes} is ${metric.gzipDeltaBytes} bytes above the reference`,
			});
		}
	}

	for (const assetType of ['javascript', 'css']) {
		for (const match of markers[assetType]) {
			failures.push({
				code: 'forbidden-static-marker',
				...match,
				message: `${match.marker} is present in static ${assetType} asset ${match.file}`,
			});
		}
	}

	const dynamicEntries = [];
	const staticJavascriptFiles = new Set(staticAssets.javascript);
	for (const requiredKey of budget.requiredDynamicEntries) {
		const manifestEntry = manifest[requiredKey];
		const dynamicFile = manifestEntry?.file;
		const hasDynamicFile =
			typeof dynamicFile === 'string' && dynamicFile.trim() !== '';
		const status = {
			key: requiredKey,
			exists: isObject(manifestEntry),
			isDynamicEntry: manifestEntry?.isDynamicEntry === true,
			dynamicallyReachable: dynamicReachableSet.has(requiredKey),
			staticallyReachable: staticClosureSet.has(requiredKey),
			file: hasDynamicFile ? dynamicFile : null,
		};
		dynamicEntries.push(status);

		if (!status.exists) {
			failures.push({
				code: 'dynamic-entry-missing',
				key: requiredKey,
				message: `Required dynamic entry "${requiredKey}" is missing from the Vite manifest`,
			});
			continue;
		}
		if (!status.isDynamicEntry) {
			failures.push({
				code: 'dynamic-entry-not-flagged',
				key: requiredKey,
				message: `Required dynamic entry "${requiredKey}" does not have isDynamicEntry: true`,
			});
		}
		if (!hasDynamicFile) {
			failures.push({
				code: 'dynamic-entry-file-missing',
				key: requiredKey,
				message: `Required dynamic entry "${requiredKey}" does not have a non-empty file`,
			});
		} else if (staticJavascriptFiles.has(dynamicFile)) {
			failures.push({
				code: 'dynamic-entry-shares-static-file',
				key: requiredKey,
				file: dynamicFile,
				message: `Required dynamic entry "${requiredKey}" shares static JavaScript file "${dynamicFile}"`,
			});
		}
		if (!status.dynamicallyReachable) {
			failures.push({
				code: 'dynamic-entry-unreachable',
				key: requiredKey,
				message: `Required dynamic entry "${requiredKey}" is not dynamically reachable from "${entryKey}"`,
			});
		}
		if (status.staticallyReachable) {
			failures.push({
				code: 'dynamic-entry-statically-reachable',
				key: requiredKey,
				message: `Required dynamic entry "${requiredKey}" is also in the static entry closure`,
			});
		}
	}

	const buildWarnings = parseBuildWarnings(buildLog);
	for (const warning of buildWarnings) {
		if (warning.type === 'unknown') {
			failures.push({
				code: 'unknown-build-warning',
				message: warning.message,
			});
		}
	}

	return {
		entry: entryKey,
		metrics,
		staticClosure,
		staticAssets,
		dynamicReachable,
		dynamicEntries,
		markers,
		buildWarnings,
		warnings,
		failures,
	};
}

function outputText(value) {
	if (Buffer.isBuffer(value)) {
		return value.toString('utf8');
	}
	return typeof value === 'string' ? value : '';
}

/**
 * Pure validation of the injected/static child-process result.
 */
export function analyzeStaticGraphRun(runResult) {
	const stdout = outputText(runResult?.stdout);
	const stderr = outputText(runResult?.stderr);
	const status = Number.isInteger(runResult?.status)
		? runResult.status
		: Number.isInteger(runResult?.exitCode)
			? runResult.exitCode
			: null;
	const failures = [];
	let report = null;

	if (runResult?.error) {
		failures.push({
			code: 'static-graph-spawn',
			message: `Static graph runner could not start: ${runResult.error.message ?? runResult.error}`,
		});
	}
	if (status !== 0) {
		failures.push({
			code: 'static-graph-exit',
			status,
			message: `Static graph runner exited with ${status ?? 'no exit code'}${
				stderr.trim() ? `: ${stderr.trim()}` : ''
			}`,
		});
	}

	try {
		report = JSON.parse(stdout);
		if (!isObject(report) || !Array.isArray(report.unresolved)) {
			throw new Error('JSON report must contain an unresolved array');
		}
	} catch (error) {
		failures.push({
			code: 'static-graph-json',
			message: `Static graph runner returned invalid JSON: ${error.message}`,
		});
		report = null;
	}

	if (report?.unresolved.length > 0) {
		failures.push({
			code: 'static-graph-unresolved',
			count: report.unresolved.length,
			unresolved: report.unresolved,
			message: `Static graph contains ${report.unresolved.length} unresolved import(s)`,
		});
	}

	return { status, stdout, stderr, report, failures };
}

export function createStaticGraphInvocation(budget, cwd = process.cwd()) {
	validateBudgetConfig(budget);
	return {
		command: process.execPath,
		args: [
			staticGraphScriptPath,
			'--json',
			...budget.staticGraph.externalUnreachable.map(
				(value) => `--assert-external-unreachable=${value}`,
			),
			...budget.staticGraph.localUnreachable.map(
				(value) => `--assert-local-prefix-unreachable=${value}`,
			),
		],
		cwd,
	};
}

function defaultGraphRunner({ command, args, cwd }) {
	return spawnSync(command, args, {
		cwd,
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
		windowsHide: true,
	});
}

function resolveAssetPath(distDir, assetFile) {
	const resolvedDist = path.resolve(distDir);
	const resolvedAsset = path.resolve(resolvedDist, assetFile);
	const allowedPrefix = `${resolvedDist}${path.sep}`;
	if (resolvedAsset !== resolvedDist && !resolvedAsset.startsWith(allowedPrefix)) {
		throw new Error(
			`Emitted asset path escapes the dist directory: "${assetFile}"`,
		);
	}
	return resolvedAsset;
}

function assetPathIdentity(assetPath) {
	return process.platform === 'win32' ? assetPath.toLowerCase() : assetPath;
}

async function readJson(jsonPath, label) {
	let source;
	try {
		source = await readFile(jsonPath, 'utf8');
	} catch (error) {
		throw new Error(`Unable to read ${label} at "${jsonPath}": ${error.message}`);
	}
	try {
		return JSON.parse(source);
	} catch (error) {
		throw new Error(`Unable to parse ${label} at "${jsonPath}": ${error.message}`);
	}
}

async function readAssetContents(distDir, staticAssets) {
	const result = {
		javascript: new Map(),
		css: new Map(),
	};
	for (const assetType of ['javascript', 'css']) {
		for (const assetFile of staticAssets[assetType]) {
			const assetPath = resolveAssetPath(distDir, assetFile);
			try {
				result[assetType].set(assetFile, await readFile(assetPath));
			} catch (error) {
				throw new Error(
					`Unable to read emitted asset "${assetFile}" at "${assetPath}": ${error.message}`,
				);
			}
		}
	}
	return result;
}

async function readDynamicEntryFiles(
	distDir,
	manifest,
	requiredKeys,
	staticJavascriptFiles,
) {
	const staticJavascriptFileSet = new Set(staticJavascriptFiles);
	const staticFileByIdentity = new Map();
	for (const staticFile of staticJavascriptFiles) {
		const staticPath = resolveAssetPath(distDir, staticFile);
		staticFileByIdentity.set(assetPathIdentity(staticPath), staticFile);
	}

	const keysByFile = new Map();
	for (const requiredKey of requiredKeys) {
		const manifestEntry = manifest[requiredKey];
		const assetFile = manifestEntry?.file;
		if (
			!isObject(manifestEntry) ||
			typeof assetFile !== 'string' ||
			assetFile.trim() === ''
		) {
			continue;
		}

		const keys = keysByFile.get(assetFile) ?? [];
		keys.push(requiredKey);
		keysByFile.set(assetFile, keys);
	}

	const failures = [];
	for (const [assetFile, keys] of keysByFile) {
		let assetPath;
		try {
			assetPath = resolveAssetPath(distDir, assetFile);
			const staticFile = staticFileByIdentity.get(
				assetPathIdentity(assetPath),
			);
			if (
				staticFile !== undefined &&
				!staticJavascriptFileSet.has(assetFile)
			) {
				for (const key of keys) {
					failures.push({
						code: 'dynamic-entry-shares-static-file',
						key,
						file: assetFile,
						staticFile,
						message: `Required dynamic entry "${key}" resolves to static JavaScript file "${staticFile}" via "${assetFile}"`,
					});
				}
			}
			await readFile(assetPath);
		} catch (error) {
			failures.push({
				code: 'dynamic-entry-file-unreadable',
				keys,
				file: assetFile,
				message: `Unable to read required dynamic entry file "${assetFile}"${
					assetPath ? ` at "${assetPath}"` : ''
				}: ${error.message}`,
			});
		}
	}
	return failures;
}

/**
 * I/O boundary used by the CLI and tests. `graphRunner` is injectable so unit
 * tests never execute the repository-wide static graph scan.
 */
export async function checkWebPerformanceBudget({
	distDir,
	budgetPath = defaultBudgetPath,
	buildLogPath,
	graphRunner = defaultGraphRunner,
	cwd = process.cwd(),
}) {
	assertNonEmptyString(distDir, 'distDir');
	const resolvedDist = path.resolve(cwd, distDir);
	const resolvedBudget = path.resolve(cwd, budgetPath);
	const budget = validateBudgetConfig(
		await readJson(resolvedBudget, 'performance budget'),
	);
	const manifestPath = path.join(resolvedDist, '.vite', 'manifest.json');
	const manifest = await readJson(manifestPath, 'Vite manifest');
	const staticClosure = collectStaticClosure(
		manifest,
		budget.entry.manifestKey,
	);
	const staticAssets = collectStaticAssets(manifest, staticClosure);
	const assetContents = await readAssetContents(resolvedDist, staticAssets);
	let buildLog = '';
	if (buildLogPath !== undefined) {
		const resolvedBuildLog = path.resolve(cwd, buildLogPath);
		try {
			buildLog = await readFile(resolvedBuildLog, 'utf8');
		} catch (error) {
			throw new Error(
				`Unable to read build log at "${resolvedBuildLog}": ${error.message}`,
			);
		}
	}

	const analysis = evaluatePerformanceBudget({
		budget,
		manifest,
		assetContents,
		buildLog,
	});
	const dynamicEntryFileFailures = await readDynamicEntryFiles(
		resolvedDist,
		manifest,
		budget.requiredDynamicEntries,
		staticAssets.javascript,
	);
	const graphInvocation = createStaticGraphInvocation(budget, cwd);
	let rawGraphResult;
	try {
		rawGraphResult = await graphRunner(graphInvocation);
	} catch (error) {
		rawGraphResult = { status: null, stdout: '', stderr: '', error };
	}
	const staticGraph = analyzeStaticGraphRun(rawGraphResult);
	const failures = [
		...analysis.failures,
		...dynamicEntryFileFailures,
		...staticGraph.failures,
	];

	return {
		ok: failures.length === 0,
		...analysis,
		staticGraph,
		failures,
	};
}

function takeOptionValue(argv, index, optionName) {
	const argument = argv[index];
	const equalsPrefix = `${optionName}=`;
	if (argument.startsWith(equalsPrefix)) {
		const value = argument.slice(equalsPrefix.length);
		if (value === '') {
			throw new Error(`${optionName} requires a value`);
		}
		return { value, consumed: 0 };
	}
	if (argument === optionName) {
		const value = argv[index + 1];
		if (value === undefined || value.startsWith('--')) {
			throw new Error(`${optionName} requires a value`);
		}
		return { value, consumed: 1 };
	}
	return null;
}

export function parseCliArgs(argv) {
	const options = {
		distDir: undefined,
		budgetPath: defaultBudgetPath,
		buildLogPath: undefined,
		json: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--json') {
			options.json = true;
			continue;
		}

		let matched = false;
		for (const [optionName, property] of [
			['--dist', 'distDir'],
			['--budget', 'budgetPath'],
			['--build-log', 'buildLogPath'],
		]) {
			const parsed = takeOptionValue(argv, index, optionName);
			if (parsed) {
				options[property] = parsed.value;
				index += parsed.consumed;
				matched = true;
				break;
			}
		}
		if (!matched) {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}

	if (!options.distDir) {
		throw new Error('--dist is required');
	}
	return options;
}

function formatMetric(label, metric) {
	return [
		`${label} raw: ${metric.rawBytes} / ${metric.maxRawBytes} bytes`,
		`${label} gzip: ${metric.gzipBytes} bytes (reference ${metric.referenceGzipBytes}, delta ${metric.gzipDeltaBytes >= 0 ? '+' : ''}${metric.gzipDeltaBytes})`,
	];
}

export function formatHumanReport(report) {
	const lines = [
		`Web performance budget: ${report.ok ? 'PASS' : 'FAIL'}`,
		`Entry: ${report.entry}`,
		...formatMetric('JavaScript', report.metrics.javascript),
		...formatMetric('CSS', report.metrics.css),
		`Required dynamic entries: ${report.dynamicEntries.length}`,
		`Static graph unresolved imports: ${report.staticGraph.report?.unresolved.length ?? 'unavailable'}`,
	];
	for (const warning of report.warnings) {
		lines.push(`WARNING [${warning.code}] ${warning.message}`);
	}
	for (const warning of report.buildWarnings) {
		lines.push(`BUILD WARNING [${warning.type}] ${warning.message}`);
	}
	for (const failure of report.failures) {
		lines.push(`ERROR [${failure.code}] ${failure.message}`);
	}
	return lines.join('\n');
}

export async function runCli(argv = process.argv.slice(2), consoleLike = console) {
	let options;
	try {
		options = parseCliArgs(argv);
		const report = await checkWebPerformanceBudget({
			distDir: options.distDir,
			budgetPath: options.budgetPath,
			buildLogPath: options.buildLogPath,
		});
		consoleLike.log(
			options.json
				? JSON.stringify(report, null, 2)
				: formatHumanReport(report),
		);
		return report.ok ? 0 : 1;
	} catch (error) {
		const diagnostic = {
			ok: false,
			error: {
				code: 'performance-budget-check-error',
				message: error.message,
			},
		};
		if (options?.json || argv.includes('--json')) {
			consoleLike.log(JSON.stringify(diagnostic, null, 2));
		} else {
			consoleLike.error(
				`Web performance budget: ERROR\n${diagnostic.error.message}`,
			);
		}
		return 1;
	}
}

const isMainModule =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
	process.exitCode = await runCli();
}
