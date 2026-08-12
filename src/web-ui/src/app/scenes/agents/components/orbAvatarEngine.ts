/**
 * Orb avatar engine — deterministic point-cloud avatars for AI agents.
 *
 * Each agent identity maps to one of nine motion forms (ported from the
 * approved agents-page design demo, inspired by the MIT-licensed
 * `thinking-orbs` vocabulary). An orb is a static frame while idle,
 * animates while its row is selected or its agent is running, and always
 * renders a static frame under `prefers-reduced-motion`.
 *
 * The ink color is read from the canvas element's computed CSS color, so
 * theme tokens stay authoritative and light/dark themes both work.
 */

export type OrbType =
  | 'breathing'
  | 'searching'
  | 'working'
  | 'solving'
  | 'listening'
  | 'connecting'
  | 'weaving'
  | 'composing'
  | 'shaping';

export const ORB_TYPES: readonly OrbType[] = [
  'breathing',
  'searching',
  'working',
  'solving',
  'listening',
  'connecting',
  'weaving',
  'composing',
  'shaping',
];

/** Deterministic identity -> motion form assignment. */
export function resolveOrbType(identity: string): OrbType {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ORB_TYPES[(hash >>> 0) % ORB_TYPES.length];
}

export interface OrbHandle {
  /** Start or stop the motion form; stopping restores the static frame. */
  setAnimating(animating: boolean): void;
  /** Detach from the shared clock and release the canvas. */
  dispose(): void;
}

const TAU = Math.PI * 2;

type Ctx = CanvasRenderingContext2D;

function drawDot(ctx: Ctx, x: number, y: number, r: number, alpha: number, ink: string): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Inscribed m-gon radius (vertices = 1). */
function polygonRadius(angle: number, sides: number): number {
  const segment = TAU / sides;
  const d = ((angle % segment) + segment) % segment - segment / 2;
  return Math.cos(segment / 2) / Math.cos(d);
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

function fibSphere(count: number): Array<readonly [number, number, number]> {
  const points: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < count; index += 1) {
    const y = 1 - (index / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = index * 2.39996;
    points.push([Math.cos(theta) * radius, y, Math.sin(theta) * radius]);
  }
  return points;
}

const SEARCH_POINTS = fibSphere(90);
const CONNECT_POINTS: Array<readonly [number, number, number]> = [
  [-0.6, -0.5, 0],
  [0.1, -0.75, 1.2],
  [0.68, -0.28, 2.1],
  [0.5, 0.48, 3.3],
  [-0.15, 0.7, 4.0],
  [-0.72, 0.22, 5.1],
  [0.05, -0.05, 2.6],
];

const ORB_PAINTERS: Record<OrbType, (ctx: Ctx, size: number, t: number, ink: string) => void> = {
  /* A slowly morphing, breathing ring. */
  breathing(ctx, size, t, ink) {
    const c = size / 2;
    const radius = size * 0.36;
    const count = 26;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * TAU;
      const wave = 0.5 + 0.5 * Math.sin(t * 0.9 + angle * 3);
      drawDot(
        ctx,
        c + Math.cos(angle) * radius * (1 + 0.1 * wave),
        c + Math.sin(angle) * radius * (1 + 0.1 * wave),
        size * 0.034,
        0.35 + 0.55 * wave,
        ink,
      );
    }
  },
  /* A scanning meridian sweeping a dotted sphere. */
  searching(ctx, size, t, ink) {
    const c = size / 2;
    const radius = size * 0.38;
    const rotation = t * 0.15;
    const sweep = (t * 0.9) % TAU;
    for (const [ux, uy, uz] of SEARCH_POINTS) {
      const x = ux * Math.cos(rotation) - uz * Math.sin(rotation);
      const z = ux * Math.sin(rotation) + uz * Math.cos(rotation);
      const pointAngle = Math.atan2(uy, x);
      let delta = Math.abs(pointAngle - sweep);
      if (delta > Math.PI) delta = TAU - delta;
      const glow = Math.exp(-delta * delta * 7);
      drawDot(
        ctx,
        c + x * radius,
        c + uy * radius * 0.92,
        size * (0.016 + 0.014 * (z * 0.5 + 0.5)),
        0.22 + 0.68 * glow,
        ink,
      );
    }
  },
  /* Particles riding a tilted orbit. */
  working(ctx, size, t, ink) {
    const c = size / 2;
    const radius = size * 0.4;
    const tilt = -0.42;
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);
    for (let index = 0; index < 26; index += 1) {
      const angle = (index / 26) * TAU;
      const ex = Math.cos(angle) * radius;
      const ey = Math.sin(angle) * radius * 0.38;
      drawDot(ctx, c + ex * cosTilt - ey * sinTilt, c + ex * sinTilt + ey * cosTilt, size * 0.018, 0.18, ink);
    }
    for (let k = 0; k < 3; k += 1) {
      const angle = t * 1.6 + (k * TAU) / 3;
      const ex = Math.cos(angle) * radius;
      const ey = Math.sin(angle) * radius * 0.38;
      drawDot(
        ctx,
        c + ex * cosTilt - ey * sinTilt,
        c + ex * sinTilt + ey * cosTilt,
        size * 0.042,
        0.6 + 0.35 * (Math.sin(angle) * 0.5 + 0.5),
        ink,
      );
    }
  },
  /* Horizontal dot bands that scatter and settle. */
  solving(ctx, size, t, ink) {
    const c = size / 2;
    const radius = size * 0.36;
    const amplitude = (0.5 + 0.5 * Math.sin(t * 0.7)) * size * 0.09;
    for (let band = 0; band < 5; band += 1) {
      const y = c + (band - 2) * radius * 0.44;
      for (let index = 0; index < 9; index += 1) {
        const px = c + (index - 4) * radius * 0.23 + Math.sin(index * 2.3 + band * 1.7 + t * 1.3) * amplitude;
        drawDot(ctx, px, y, size * 0.026, 0.7, ink);
      }
    }
  },
  /* A ripple rolling around a ring. */
  listening(ctx, size, t, ink) {
    const c = size / 2;
    const radius = size * 0.36;
    const count = 24;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * TAU;
      const wave = 0.5 + 0.5 * Math.sin(t * 2.2 - angle * 2);
      drawDot(
        ctx,
        c + Math.cos(angle) * radius,
        c + Math.sin(angle) * radius,
        size * (0.018 + 0.022 * wave),
        0.3 + 0.55 * wave,
        ink,
      );
    }
  },
  /* A constellation connecting itself. */
  connecting(ctx, size, t, ink) {
    const c = size / 2;
    const radius = size * 0.34;
    const points = CONNECT_POINTS.map(([px, py, phase]) => [
      c + (px + 0.09 * Math.sin(t * 0.6 + phase)) * radius,
      c + (py + 0.09 * Math.cos(t * 0.5 + phase * 1.3)) * radius,
    ] as const);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(0.6, size * 0.02);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const distance = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
        if (distance < radius * 1.15) {
          ctx.globalAlpha = (1 - distance / (radius * 1.15)) * (0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t + i + j)));
          ctx.beginPath();
          ctx.moveTo(points[i][0], points[i][1]);
          ctx.lineTo(points[j][0], points[j][1]);
          ctx.stroke();
        }
      }
    }
    for (const [x, y] of points) drawDot(ctx, x, y, size * 0.03, 0.85, ink);
  },
  /* Three strands weaving around a sphere. */
  weaving(ctx, size, t, ink) {
    const c = size / 2;
    const radius = size * 0.38;
    for (let strand = 0; strand < 3; strand += 1) {
      for (let index = 0; index < 36; index += 1) {
        const u = (index / 36) * TAU;
        const x = c + Math.cos(u) * radius;
        const y = c + Math.sin(u * 3 + (strand * TAU) / 3 + t * 1.2) * radius * 0.4 * Math.sin(u);
        const depth = 0.5 + 0.5 * Math.cos(u + t * 0.4);
        drawDot(ctx, x, y, size * 0.02, 0.25 + 0.55 * depth, ink);
      }
    }
  },
  /* Undulating horizontal bands. */
  composing(ctx, size, t, ink) {
    const c = size / 2;
    const radius = size * 0.36;
    for (let band = 0; band < 4; band += 1) {
      for (let index = 0; index < 15; index += 1) {
        const u = index / 14;
        const x = c + (u - 0.5) * 2 * radius;
        const y = c + (band - 1.5) * radius * 0.3 + Math.sin(u * 6 + t * 1.4 + band * 1.3) * size * 0.032;
        drawDot(ctx, x, y, size * 0.021, 0.6, ink);
      }
    }
  },
  /* A dotted outline morphing circle -> triangle -> square. */
  shaping(ctx, size, t, ink) {
    const c = size / 2;
    const radius = size * 0.3;
    const count = 36;
    const phase = (t * 0.22) % 3;
    const index = Math.floor(phase);
    const fraction = smooth(phase - index);
    const shapes: Array<number | null> = [null, 3, 4];
    const radiusAt = (angle: number, sides: number | null) =>
      sides === null ? 1 : polygonRadius(angle + (sides === 3 ? Math.PI / 2 : Math.PI / 4), sides);
    for (let dotIndex = 0; dotIndex < count; dotIndex += 1) {
      const angle = (dotIndex / count) * TAU;
      const r1 = radiusAt(angle, shapes[index]);
      const r2 = radiusAt(angle, shapes[(index + 1) % 3]);
      const r = radius * (r1 + (r2 - r1) * fraction) * 1.05;
      drawDot(ctx, c + Math.cos(angle) * r, c + Math.sin(angle) * r, size * 0.024, 0.75, ink);
    }
  },
};

interface OrbInstance {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  type: OrbType;
  size: number;
  ink: string | null;
  requestedAnimating: boolean;
  animating: boolean;
  visible: boolean;
  reducedMotion: boolean;
  startTimestamp: number;
}

const liveOrbs = new Set<OrbInstance>();
const orbByCanvas = new Map<HTMLCanvasElement, OrbInstance>();
let rafId: number | null = null;
let themeObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let visibilityListenerAttached = false;

function resolveInk(canvas: HTMLCanvasElement): string | null {
  try {
    return window.getComputedStyle(canvas).color || null;
  } catch {
    return null;
  }
}

function paintOrb(orb: OrbInstance, t: number): void {
  const { ink } = orb;
  if (!ink) return;
  const { ctx, size } = orb;
  ctx.clearRect(0, 0, size, size);
  ctx.globalAlpha = 1;
  ORB_PAINTERS[orb.type](ctx, size, t, ink);
  ctx.globalAlpha = 1;
}

function syncOrbSize(orb: OrbInstance): void {
  const cssSize = Math.max(12, Math.round(orb.canvas.clientWidth || orb.size || 20));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bitmapSize = cssSize * dpr;
  if (orb.size === cssSize && orb.canvas.width === bitmapSize && orb.canvas.height === bitmapSize) {
    return;
  }
  orb.size = cssSize;
  orb.canvas.width = bitmapSize;
  orb.canvas.height = bitmapSize;
  orb.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintOrb(orb, 0);
}

function ensureThemeObserver(): void {
  if (themeObserver || typeof MutationObserver === 'undefined') return;
  themeObserver = new MutationObserver(() => {
    for (const orb of liveOrbs) {
      orb.ink = resolveInk(orb.canvas);
      paintOrb(orb, 0);
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  });
}

function ensureResizeObserver(): void {
  if (resizeObserver || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(() => {
    for (const orb of liveOrbs) syncOrbSize(orb);
  });
}

function scheduleClock(): void {
  if (rafId !== null) return;
  rafId = window.requestAnimationFrame(tick);
}

function updateOrbAnimation(orb: OrbInstance): void {
  const shouldAnimate = orb.requestedAnimating
    && orb.visible
    && !orb.reducedMotion
    && document.visibilityState !== 'hidden';
  if (shouldAnimate) {
    if (!orb.animating) {
      orb.animating = true;
      orb.startTimestamp = performance.now();
    }
    scheduleClock();
  } else if (orb.animating) {
    orb.animating = false;
    paintOrb(orb, 0);
  }
}

function ensureIntersectionObserver(): void {
  if (intersectionObserver || typeof IntersectionObserver === 'undefined') return;
  intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const orb = orbByCanvas.get(entry.target as HTMLCanvasElement);
      if (!orb) continue;
      orb.visible = entry.isIntersecting;
      updateOrbAnimation(orb);
    }
  });
}

function handleDocumentVisibility(): void {
  for (const orb of liveOrbs) updateOrbAnimation(orb);
}

function ensureDocumentVisibilityListener(): void {
  if (visibilityListenerAttached) return;
  document.addEventListener('visibilitychange', handleDocumentVisibility);
  visibilityListenerAttached = true;
}

function releaseSharedObserversIfIdle(): void {
  if (liveOrbs.size > 0) return;
  themeObserver?.disconnect();
  themeObserver = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  intersectionObserver?.disconnect();
  intersectionObserver = null;
  if (visibilityListenerAttached) {
    document.removeEventListener('visibilitychange', handleDocumentVisibility);
    visibilityListenerAttached = false;
  }
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function tick(now: number): void {
  rafId = null;
  let any = false;
  for (const orb of liveOrbs) {
    if (orb.animating) {
      any = true;
      paintOrb(orb, (now - orb.startTimestamp) / 1000);
    }
  }
  if (any) scheduleClock();
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Attach an orb to a canvas. The canvas keeps its CSS-box size; the bitmap
 * is matched to device pixels (DPR capped at 2). Returns a no-op handle in
 * environments without a 2D context (e.g. test renderers).
 */
export function attachOrb(canvas: HTMLCanvasElement, type: OrbType): OrbHandle {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    return { setAnimating: () => undefined, dispose: () => undefined };
  }

  const cssSize = Math.max(12, Math.round(canvas.clientWidth || 20));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = cssSize * dpr;
  canvas.height = cssSize * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const orb: OrbInstance = {
    canvas,
    ctx,
    type,
    size: cssSize,
    ink: resolveInk(canvas),
    requestedAnimating: false,
    animating: false,
    visible: true,
    reducedMotion: prefersReducedMotion(),
    startTimestamp: 0,
  };
  liveOrbs.add(orb);
  orbByCanvas.set(canvas, orb);
  ensureThemeObserver();
  ensureResizeObserver();
  ensureIntersectionObserver();
  ensureDocumentVisibilityListener();
  resizeObserver?.observe(canvas);
  intersectionObserver?.observe(canvas);
  paintOrb(orb, 0);

  return {
    setAnimating(animating: boolean) {
      orb.requestedAnimating = animating;
      updateOrbAnimation(orb);
    },
    dispose() {
      orb.requestedAnimating = false;
      orb.animating = false;
      liveOrbs.delete(orb);
      orbByCanvas.delete(orb.canvas);
      resizeObserver?.unobserve(orb.canvas);
      intersectionObserver?.unobserve(orb.canvas);
      releaseSharedObserversIfIdle();
    },
  };
}
