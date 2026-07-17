import { getCurrentWebview } from '@tauri-apps/api/webview';

import { configManager } from '@/infrastructure/config/services/ConfigManager';
import { createLogger } from '@/shared/utils/logger';

import { isTauriRuntime } from './environment';

const log = createLogger('DesktopZoom');

export const DESKTOP_ZOOM_LEVELS = [
  0.5,
  0.67,
  0.75,
  0.8,
  0.9,
  1,
  1.1,
  1.25,
  1.5,
  1.75,
  2,
  2.5,
  3,
] as const;

export const DEFAULT_DESKTOP_ZOOM_LEVEL = 1;
export const DESKTOP_ZOOM_CONFIG_PATH = 'app.zoom_level';

export type DesktopZoomAction = 'in' | 'out' | 'reset';

export interface DesktopZoomAdapter {
  setZoom(scaleFactor: number): Promise<void>;
}

export interface DesktopZoomPreference {
  read(): Promise<number | undefined>;
  write(scaleFactor: number): Promise<void>;
}

const isMacPlatform = (platform: string): boolean =>
  platform.toUpperCase().includes('MAC');

export const desktopZoomActionFromKeyboardEvent = (
  event: Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey'>,
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
): DesktopZoomAction | null => {
  const primaryModifier = isMacPlatform(platform) ? event.metaKey : event.ctrlKey;
  if (!primaryModifier || event.altKey) return null;

  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') {
    return 'reset';
  }

  if (
    event.key === '+' ||
    event.key === '=' ||
    event.code === 'Equal' ||
    event.code === 'NumpadAdd'
  ) {
    return 'in';
  }

  if (
    event.key === '-' ||
    event.key === '_' ||
    event.code === 'Minus' ||
    event.code === 'NumpadSubtract'
  ) {
    return 'out';
  }

  return null;
};

export const normalizeDesktopZoomLevel = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DESKTOP_ZOOM_LEVEL;
  }

  return DESKTOP_ZOOM_LEVELS.reduce((nearest, candidate) =>
    Math.abs(candidate - value) < Math.abs(nearest - value) ? candidate : nearest,
  DEFAULT_DESKTOP_ZOOM_LEVEL);
};

export const nextDesktopZoomLevel = (
  currentLevel: number,
  action: DesktopZoomAction,
): number => {
  if (action === 'reset') return DEFAULT_DESKTOP_ZOOM_LEVEL;

  const normalizedLevel = normalizeDesktopZoomLevel(currentLevel);
  const currentIndex = DESKTOP_ZOOM_LEVELS.indexOf(
    normalizedLevel as (typeof DESKTOP_ZOOM_LEVELS)[number],
  );
  const offset = action === 'in' ? 1 : -1;
  const nextIndex = Math.min(
    DESKTOP_ZOOM_LEVELS.length - 1,
    Math.max(0, currentIndex + offset),
  );

  return DESKTOP_ZOOM_LEVELS[nextIndex];
};

export class DesktopZoomController {
  private appliedLevel = DEFAULT_DESKTOP_ZOOM_LEVEL;
  private requestedLevel = DEFAULT_DESKTOP_ZOOM_LEVEL;
  private operationQueue: Promise<void> = Promise.resolve();
  private requestSequence = 0;
  private listening = false;

  constructor(
    private readonly eventTarget: Window,
    private readonly adapter: DesktopZoomAdapter,
    private readonly preference: DesktopZoomPreference,
    private readonly platform = typeof navigator === 'undefined' ? '' : navigator.platform,
  ) {}

  async initialize(): Promise<void> {
    let initialLevel = DEFAULT_DESKTOP_ZOOM_LEVEL;
    try {
      initialLevel = normalizeDesktopZoomLevel(await this.preference.read());
    } catch (error) {
      log.warn('Failed to read desktop zoom preference; using 100%', { error });
    }

    try {
      await this.adapter.setZoom(initialLevel);
      this.appliedLevel = initialLevel;
      this.requestedLevel = initialLevel;
    } catch (error) {
      log.warn('Failed to apply saved desktop zoom; using WebView default', { error });
      this.appliedLevel = DEFAULT_DESKTOP_ZOOM_LEVEL;
      this.requestedLevel = DEFAULT_DESKTOP_ZOOM_LEVEL;
    }

    if (!this.listening) {
      this.eventTarget.addEventListener('keydown', this.handleKeyDown, { capture: true });
      this.listening = true;
    }
  }

  dispose(): void {
    if (!this.listening) return;
    this.eventTarget.removeEventListener('keydown', this.handleKeyDown, { capture: true });
    this.listening = false;
  }

  whenIdle(): Promise<void> {
    return this.operationQueue;
  }

  getRequestedLevel(): number {
    return this.requestedLevel;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const action = desktopZoomActionFromKeyboardEvent(event, this.platform);
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();

    const targetLevel = nextDesktopZoomLevel(this.requestedLevel, action);
    if (targetLevel === this.requestedLevel && action !== 'reset') return;

    this.requestedLevel = targetLevel;
    const requestSequence = ++this.requestSequence;
    this.operationQueue = this.operationQueue.then(async () => {
      try {
        await this.adapter.setZoom(targetLevel);
        this.appliedLevel = targetLevel;
      } catch (error) {
        if (requestSequence === this.requestSequence) {
          this.requestedLevel = this.appliedLevel;
        }
        log.warn('Failed to apply desktop zoom', { error, targetLevel });
        return;
      }

      try {
        await this.preference.write(targetLevel);
      } catch (error) {
        log.warn('Failed to persist desktop zoom preference', { error, targetLevel });
      }
    });
  };
}

let activeDesktopZoomController: DesktopZoomController | null = null;
let desktopZoomInitializationSequence = 0;

export const initializeDesktopZoom = async (): Promise<void> => {
  if (!isTauriRuntime()) return;

  const initializationSequence = ++desktopZoomInitializationSequence;
  activeDesktopZoomController?.dispose();
  activeDesktopZoomController = null;
  delete document.documentElement.dataset.voidDesktopZoomReady;

  const controller = new DesktopZoomController(
    window,
    {
      setZoom: scaleFactor => getCurrentWebview().setZoom(scaleFactor),
    },
    {
      read: () => configManager.getConfig<number>(DESKTOP_ZOOM_CONFIG_PATH),
      write: scaleFactor => configManager.setConfig(DESKTOP_ZOOM_CONFIG_PATH, scaleFactor),
    },
  );
  await controller.initialize();

  if (initializationSequence !== desktopZoomInitializationSequence) {
    controller.dispose();
    return;
  }

  activeDesktopZoomController = controller;
  document.documentElement.dataset.voidDesktopZoomReady = 'true';
};
