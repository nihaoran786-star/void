// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachOrb } from './orbAvatarEngine';

function createCanvasContext(): CanvasRenderingContext2D {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('orb avatar engine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses a compact CSS fallback before layout instead of the canvas intrinsic width', () => {
    const canvas = document.createElement('canvas');
    const context = createCanvasContext();
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });

    const handle = attachOrb(canvas, 'breathing');

    expect(canvas.width).toBe(20);
    expect(canvas.height).toBe(20);
    handle.dispose();
  });

  it('caches theme ink instead of reading computed style on every animation frame', () => {
    const canvas = document.createElement('canvas');
    const context = createCanvasContext();
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      color: 'rgb(12, 34, 56)',
    } as unknown as CSSStyleDeclaration);
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });

    const handle = attachOrb(canvas, 'breathing');
    handle.setAnimating(true);
    frame?.(1_000);

    expect(styleSpy).toHaveBeenCalledTimes(1);
    handle.dispose();
    frame?.(1_016);
  });

  it('repaints static orbs when the root theme tokens change', () => {
    const canvas = document.createElement('canvas');
    const context = createCanvasContext();
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    let color = 'rgb(12, 34, 56)';
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
      color,
    } as unknown as CSSStyleDeclaration));
    let notifyThemeChange: (() => void) | undefined;
    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        notifyThemeChange = () => callback([], this as unknown as MutationObserver);
      }
      observe(): void {}
      disconnect(): void {}
      takeRecords(): MutationRecord[] { return []; }
    }
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const handle = attachOrb(canvas, 'breathing');
    expect(context.fillStyle).toBe(color);

    color = 'rgb(78, 90, 123)';
    expect(notifyThemeChange).toBeTypeOf('function');
    notifyThemeChange?.();

    expect(context.fillStyle).toBe(color);
    handle.dispose();
  });

  it('resizes the bitmap after layout gives the orb its final CSS size', () => {
    const canvas = document.createElement('canvas');
    const context = createCanvasContext();
    let cssSize = 0;
    Object.defineProperty(canvas, 'clientWidth', { get: () => cssSize });
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    let notifyResize: (() => void) | undefined;
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this as unknown as ResizeObserver);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const handle = attachOrb(canvas, 'breathing');
    expect(canvas.width).toBe(20);

    cssSize = 54;
    expect(notifyResize).toBeTypeOf('function');
    notifyResize?.();

    expect(canvas.width).toBe(54);
    expect(canvas.height).toBe(54);
    handle.dispose();
  });

  it('pauses offscreen orbs and resumes them through the shared clock when visible', () => {
    const canvas = document.createElement('canvas');
    const context = createCanvasContext();
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    let notifyVisibility: ((visible: boolean) => void) | undefined;
    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        notifyVisibility = (visible) => callback([{
          target: canvas,
          isIntersecting: visible,
        } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0];
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);

    const handle = attachOrb(canvas, 'breathing');
    expect(notifyVisibility).toBeTypeOf('function');
    notifyVisibility?.(false);
    handle.setAnimating(true);
    expect(rafSpy).not.toHaveBeenCalled();

    notifyVisibility?.(true);
    expect(rafSpy).toHaveBeenCalledTimes(1);
    handle.dispose();
  });
});
