import { $, browser, expect } from '@wdio/globals';
import { openWorkspace } from '../helpers/workspace-helper';

interface SceneProbeResult {
  durationMs: number;
  mutationMs: number;
  measureName: string;
}

const percentile95 = (samples: number[]): number => {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
};

const HOT_P95_BUDGET_MS = 150;
const COLD_P95_BUDGET_MS = 600;
const DATA_READY_P95_BUDGET_MS = 1_500;

async function openExtensions(): Promise<void> {
  const toggle = await $('.void-nav-panel__top-action-btn--expand');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
}

async function installRendererProbe(selector: string, label: string): Promise<void> {
  await browser.execute((targetSelector, probeLabel) => {
    const probeWindow = window as typeof window & {
      __voidSceneSwitchProbes?: Record<string, SceneProbeResult | null>;
    };
    probeWindow.__voidSceneSwitchProbes ??= {};
    probeWindow.__voidSceneSwitchProbes[probeLabel] = null;

    const startMark = `void:scene-switch:${probeLabel}:start`;
    const mutationMark = `void:scene-switch:${probeLabel}:mutation`;
    const settledMark = `void:scene-switch:${probeLabel}:settled`;
    const measureName = `void:scene-switch:${probeLabel}`;
    performance.clearMarks(startMark);
    performance.clearMarks(mutationMark);
    performance.clearMarks(settledMark);
    performance.clearMeasures(measureName);
    performance.mark(startMark);

    let observed = false;
    const observer = new MutationObserver(() => {
      if (observed || !document.querySelector(targetSelector)) {
        return;
      }
      observed = true;
      performance.mark(mutationMark);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        performance.mark(settledMark);
        performance.measure(measureName, startMark, settledMark);
        performance.measure(`${measureName}:mutation`, startMark, mutationMark);
        probeWindow.__voidSceneSwitchProbes![probeLabel] = {
          durationMs: performance.getEntriesByName(measureName).at(-1)?.duration ?? Number.NaN,
          mutationMs: performance.getEntriesByName(`${measureName}:mutation`).at(-1)?.duration
            ?? Number.NaN,
          measureName,
        };
        observer.disconnect();
      }));
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'aria-hidden'],
      childList: true,
      subtree: true,
    });
  }, selector, label);
}

async function readRendererProbe(label: string): Promise<SceneProbeResult> {
  await browser.waitUntil(async () => browser.execute((probeLabel) => {
    const probeWindow = window as typeof window & {
      __voidSceneSwitchProbes?: Record<string, SceneProbeResult | null>;
    };
    return probeWindow.__voidSceneSwitchProbes?.[probeLabel] !== null
      && probeWindow.__voidSceneSwitchProbes?.[probeLabel] !== undefined;
  }, label), {
    timeout: 2_000,
    interval: 20,
    timeoutMsg: `Renderer scene-switch probe did not settle: ${label}`,
  });

  return browser.execute((probeLabel) => {
    const probeWindow = window as typeof window & {
      __voidSceneSwitchProbes?: Record<string, SceneProbeResult | null>;
    };
    return probeWindow.__voidSceneSwitchProbes![probeLabel]!;
  }, label);
}

const scenes = [
  {
    id: 'agents',
    surface: '.void-scene-viewport__scene--active .void-agents-shell',
    ready: [
      '.void-scene-viewport__scene--active .core-agent-card',
      '.void-scene-viewport__scene--active .agent-team-card',
      '.void-scene-viewport__scene--active .void-agents-runtime-unsupported',
      '.void-scene-viewport__scene--active .void-agents-scene--page',
    ].join(', '),
  },
  {
    id: 'skills',
    surface: '.void-scene-viewport__scene--active .void-skills-scene',
    ready: [
      '.void-scene-viewport__scene--active .skills-card',
      '.void-scene-viewport__scene--active .skills-main__empty',
      '.void-scene-viewport__scene--active [data-testid="skills-runtime-unsupported"]',
    ].join(', '),
  },
  {
    id: 'connectors',
    surface: '.void-scene-viewport__scene--active [data-testid="connectors-scene"]',
    ready: [
      '.void-scene-viewport__scene--active .void-mcp-tools__catalog-card',
      '.void-scene-viewport__scene--active .void-mcp-tools__catalog-starter',
      '.void-scene-viewport__scene--active .void-mcp-tools__catalog-empty',
      '.void-scene-viewport__scene--active .void-mcp-tools__load-error',
    ].join(', '),
  },
] as const;

describe('L0 scene switch performance', () => {
  before(async () => {
    expect(await openWorkspace()).toBe(true);
    await browser.execute(async () => {
      // @ts-expect-error Vite resolves this renderer-only absolute module path at runtime.
      const { useSceneStore } = await import('/src/app/stores/sceneStore.ts');
      useSceneStore.getState().openScene('session');
    });
    await openExtensions();
  });

  it('measures cold, hot, and data-ready transitions inside the renderer', async () => {
    const coldSamples: number[] = [];
    const dataReadySamples: number[] = [];

    for (const [index, scene] of scenes.entries()) {
      const navEntry = await $(`[data-testid="nav-${scene.id}"]`);
      // Match real pointer navigation: the catalog chunk starts loading on
      // intent, while the measured interval remains click-to-settled-render.
      await navEntry.moveTo();
      await browser.pause(80);
      const renderLabel = `cold-${scene.id}-${index}`;
      const readyLabel = `data-ready-${scene.id}-${index}`;
      await installRendererProbe(scene.surface, renderLabel);
      await installRendererProbe(scene.ready, readyLabel);
      await navEntry.click();
      coldSamples.push((await readRendererProbe(renderLabel)).durationMs);
      dataReadySamples.push((await readRendererProbe(readyLabel)).durationMs);
    }

    const hotSamples: number[] = [];
    const hotSequence = Array.from(
      { length: 20 },
      (_, index) => (index % 2 === 0 ? 'skills' : 'connectors') as 'skills' | 'connectors',
    );
    for (const [index, sceneId] of hotSequence.entries()) {
      const scene = scenes.find((candidate) => candidate.id === sceneId)!;
      const label = `hot-${scene.id}-${index}`;
      await installRendererProbe(scene.surface, label);
      await $(`[data-testid="nav-${scene.id}"]`).click();
      hotSamples.push((await readRendererProbe(label)).durationMs);
    }

    const report = {
      coldSamples,
      hotSamples,
      dataReadySamples,
      coldP95: percentile95(coldSamples),
      hotP95: percentile95(hotSamples),
      dataReadyP95: percentile95(dataReadySamples),
    };
    console.info(`VOID_SCENE_SWITCH_METRICS ${JSON.stringify(report)}`);

    expect(report.hotP95).toBeLessThanOrEqual(HOT_P95_BUDGET_MS);
    expect(report.coldP95).toBeLessThanOrEqual(COLD_P95_BUDGET_MS);
    expect(report.dataReadyP95).toBeLessThanOrEqual(DATA_READY_P95_BUDGET_MS);
  });
});
