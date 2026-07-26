// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalAsrUnavailableMessageKey,
  useComposerVoiceInput,
  type ComposerVoiceInputController,
} from './useComposerVoiceInput';
import type { LocalAsrStatus } from '@/infrastructure/api/service-api/LocalAsrAPI';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  startInputSession: vi.fn(),
  appendAudioChunk: vi.fn(),
  finishInputSession: vi.fn(),
  cancelInputSession: vi.fn(),
  stopRecorder: vi.fn(),
  recorderChunk: null as ((chunk: string) => void) | null,
  insertText: vi.fn(),
  focusInputSoon: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/infrastructure/runtime', () => ({ isTauriRuntime: () => true }));
vi.mock('@/infrastructure/api/service-api/LocalAsrAPI', () => ({
  localAsrAPI: {
    getStatus: mocks.getStatus,
    startInputSession: mocks.startInputSession,
    appendAudioChunk: mocks.appendAudioChunk,
    finishInputSession: mocks.finishInputSession,
    cancelInputSession: mocks.cancelInputSession,
  },
}));
vi.mock('@/infrastructure/speech/voiceInputAudio', () => ({
  createVoiceInputRecorder: vi.fn(async (options: { onChunk: (chunk: string) => void }) => {
    mocks.recorderChunk = options.onChunk;
    return { stop: mocks.stopRecorder };
  }),
}));
vi.mock('@/infrastructure/config/services/AIExperienceConfigService', () => ({
  aiExperienceConfigService: {
    getSettingsAsync: vi.fn(async () => ({
      voice_input: {
        enabled: true,
        provider: 'local',
        model_id: 'sensevoice-small-int8',
        model_directory: 'D:/models',
        default_language: 'auto',
        max_recording_seconds: 60,
        microphone_device_id: '',
      },
    })),
    addChangeListener: vi.fn(() => () => undefined),
  },
}));
vi.mock('@/shared/notification-system', () => ({
  notificationService: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/app/stores/sceneStore', () => ({
  useSceneStore: { getState: () => ({ openScene: vi.fn() }) },
}));
vi.mock('@/app/scenes/settings/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ setActiveTab: vi.fn() }) },
}));

let controller: ComposerVoiceInputController;

function Harness({ sessionId = 'session-a' }: { sessionId?: string }) {
  controller = useComposerVoiceInput({
    composerSessionId: sessionId,
    insertText: mocks.insertText,
    focusInputSoon: mocks.focusInputSoon,
  });
  return <output>{controller.phase}</output>;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useComposerVoiceInput', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });
    mocks.recorderChunk = null;
    mocks.stopRecorder.mockResolvedValue(undefined);
    mocks.getStatus.mockResolvedValue({ status: 'ready' });
    mocks.startInputSession.mockResolvedValue({
      sessionId: 'speech-session',
      modelId: 'sensevoice-small-int8',
      language: 'auto',
      sampleRate: 16_000,
      maxRecordingSeconds: 60,
    });
    mocks.appendAudioChunk.mockResolvedValue({
      receivedBytes: 2,
      receivedSeconds: 0.001,
      limitReached: false,
    });
    mocks.finishInputSession.mockResolvedValue({
      text: 'transcribed locally',
      language: 'auto',
      durationMs: 10,
      audioDurationSeconds: 1,
    });
    mocks.cancelInputSession.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('streams local PCM chunks and inserts the finished transcript', async () => {
    act(() => root.render(<Harness />));
    await flush();

    act(() => controller.toggle());
    await flush();
    expect(controller.phase).toBe('recording');

    act(() => mocks.recorderChunk?.('AAA='));
    await flush();
    expect(mocks.appendAudioChunk).toHaveBeenCalledWith('speech-session', 'AAA=');

    act(() => controller.toggle());
    await flush();
    expect(mocks.finishInputSession).toHaveBeenCalledWith('speech-session');
    expect(mocks.insertText).toHaveBeenCalledWith('transcribed locally');
    expect(mocks.focusInputSoon).toHaveBeenCalled();
    expect(controller.phase).toBe('idle');
  });

  it('cancels recording when the composer session changes', async () => {
    act(() => root.render(<Harness sessionId="session-a" />));
    await flush();
    act(() => controller.toggle());
    await flush();
    expect(controller.phase).toBe('recording');

    act(() => root.render(<Harness sessionId="session-b" />));
    await flush();

    expect(mocks.cancelInputSession).toHaveBeenCalledWith('speech-session');
    expect(mocks.insertText).not.toHaveBeenCalled();
    expect(controller.phase).toBe('idle');
  });

  it('keeps engine, model, provider, and access failures distinct', () => {
    const status = {
      source: 'local_filesystem',
      status: 'unavailable',
      configuredModelId: 'sensevoice-small-int8',
      modelDirectory: 'D:/models',
      modelAvailable: false,
      engineAvailable: false,
      discoveredModels: [],
      error: {
        code: 'engine_not_bundled',
        message: 'missing engine',
        retryable: false,
      },
    } satisfies LocalAsrStatus;

    expect(getLocalAsrUnavailableMessageKey(status)).toBe(
      'input.voiceInput.engineUnavailable',
    );
    expect(
      getLocalAsrUnavailableMessageKey({
        ...status,
        error: { ...status.error, code: 'model_corrupt' },
      }),
    ).toBe('input.voiceInput.modelMissing');
    expect(
      getLocalAsrUnavailableMessageKey({
        ...status,
        error: { ...status.error, code: 'unsupported_provider' },
      }),
    ).toBe('input.voiceInput.providerUnsupported');
    expect(
      getLocalAsrUnavailableMessageKey({
        ...status,
        error: { ...status.error, code: 'access_denied' },
      }),
    ).toBe('input.voiceInput.accessDenied');
  });
});
