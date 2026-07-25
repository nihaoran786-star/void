import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSceneStore } from '@/app/stores/sceneStore';
import { useSettingsStore } from '@/app/scenes/settings/settingsStore';
import {
  localAsrAPI,
  type LocalAsrStatus,
  type LocalAsrInputSession,
} from '@/infrastructure/api/service-api/LocalAsrAPI';
import { aiExperienceConfigService } from '@/infrastructure/config/services/AIExperienceConfigService';
import type { VoiceInputConfig } from '@/infrastructure/config/types';
import { isTauriRuntime } from '@/infrastructure/runtime';
import {
  createVoiceInputRecorder,
  type VoiceInputRecorder,
} from '@/infrastructure/speech/voiceInputAudio';
import { notificationService } from '@/shared/notification-system';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('ComposerVoiceInput');
const SAMPLE_RATE = 16_000;
const CHUNK_DURATION_MS = 1_000;

export function getLocalAsrUnavailableMessageKey(
  status: LocalAsrStatus,
): string {
  switch (status.error?.code) {
    case 'engine_not_bundled':
      return 'input.voiceInput.engineUnavailable';
    case 'model_directory_missing':
    case 'model_missing':
    case 'model_corrupt':
    case 'invalid_model_id':
      return 'input.voiceInput.modelMissing';
    case 'unsupported_provider':
      return 'input.voiceInput.providerUnsupported';
    case 'access_denied':
      return 'input.voiceInput.accessDenied';
    default:
      return 'input.voiceInput.unavailable';
  }
}

export type VoiceInputPhase = 'idle' | 'preparing' | 'recording' | 'transcribing';

export interface ComposerVoiceInputController {
  enabled: boolean;
  disabled: boolean;
  phase: VoiceInputPhase;
  tooltip: string;
  toggle: () => void;
  cancel: () => void;
}

interface UseComposerVoiceInputOptions {
  composerSessionId: string | null;
  insertText: (text: string) => void;
  focusInputSoon: () => void;
}

function isPermissionDenied(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
}

function isWindowsVoiceCaptureSupported(): boolean {
  return typeof navigator !== 'undefined'
    && /Windows/i.test(navigator.userAgent)
    && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function useComposerVoiceInput({
  composerSessionId,
  insertText,
  focusInputSoon,
}: UseComposerVoiceInputOptions): ComposerVoiceInputController {
  const { t } = useTranslation('flow-chat');
  const [config, setConfig] = useState<VoiceInputConfig | null>(null);
  const [phase, setPhase] = useState<VoiceInputPhase>('idle');
  const sessionRef = useRef<LocalAsrInputSession | null>(null);
  const recorderRef = useRef<VoiceInputRecorder | null>(null);
  const appendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const appendErrorRef = useRef<unknown>(null);
  const limitTimerRef = useRef<number | null>(null);
  const activeRunRef = useRef(0);
  const composerSessionIdRef = useRef(composerSessionId);

  useEffect(() => {
    let mounted = true;
    void aiExperienceConfigService.getSettingsAsync().then(settings => {
      if (mounted) setConfig(settings.voice_input);
    });
    const unsubscribe = aiExperienceConfigService.addChangeListener(settings => {
      setConfig(settings.voice_input);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const clearLimitTimer = useCallback(() => {
    if (limitTimerRef.current !== null) {
      window.clearTimeout(limitTimerRef.current);
      limitTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearLimitTimer();
    recorderRef.current = null;
    sessionRef.current = null;
    appendQueueRef.current = Promise.resolve();
    appendErrorRef.current = null;
    setPhase('idle');
  }, [clearLimitTimer]);

  const cancel = useCallback(() => {
    activeRunRef.current += 1;
    const recorder = recorderRef.current;
    const session = sessionRef.current;
    reset();
    if (recorder) {
      void recorder.stop().catch(error => {
        log.warn('Failed to stop local voice recorder', { error });
      });
    }
    if (session) {
      void localAsrAPI.cancelInputSession(session.sessionId).catch(error => {
        log.warn('Failed to cancel local ASR session', { error });
      });
    }
  }, [reset]);

  useEffect(() => {
    if (composerSessionIdRef.current === composerSessionId) return;
    composerSessionIdRef.current = composerSessionId;
    if (sessionRef.current || recorderRef.current) cancel();
  }, [cancel, composerSessionId]);

  useEffect(() => () => cancel(), [cancel]);

  const openSettings = useCallback(() => {
    useSettingsStore.getState().setActiveTab('models');
    useSceneStore.getState().openScene('settings');
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const run = activeRunRef.current;
    const recorder = recorderRef.current;
    const session = sessionRef.current;
    const targetSessionId = composerSessionIdRef.current;
    if (!recorder || !session) return;
    clearLimitTimer();
    setPhase('transcribing');
    try {
      recorderRef.current = null;
      await recorder.stop();
      await appendQueueRef.current;
      if (appendErrorRef.current) throw appendErrorRef.current;
      const result = await localAsrAPI.finishInputSession(session.sessionId);
      if (
        activeRunRef.current !== run
        || composerSessionIdRef.current !== targetSessionId
      ) return;
      const transcript = result.text.trim();
      if (!transcript) {
        notificationService.info(t('input.voiceInput.empty'));
        return;
      }
      insertText(transcript);
      focusInputSoon();
    } catch (error) {
      log.error('Local voice transcription failed', { error });
      notificationService.error(t('input.voiceInput.failed'));
      await localAsrAPI.cancelInputSession(session.sessionId).catch(() => undefined);
    } finally {
      if (activeRunRef.current === run) reset();
    }
  }, [clearLimitTimer, focusInputSoon, insertText, reset, t]);

  const start = useCallback(async () => {
    if (!config?.enabled) {
      notificationService.info(t('input.voiceInput.disabled'));
      openSettings();
      return;
    }
    if (!isTauriRuntime() || !isWindowsVoiceCaptureSupported()) {
      notificationService.error(t('input.voiceInput.unsupported'));
      return;
    }

    const run = activeRunRef.current + 1;
    activeRunRef.current = run;
    setPhase('preparing');
    appendErrorRef.current = null;
    appendQueueRef.current = Promise.resolve();
    try {
      const status = await localAsrAPI.getStatus();
      if (status.status !== 'ready') {
        notificationService.warning(t(getLocalAsrUnavailableMessageKey(status)));
        openSettings();
        setPhase('idle');
        return;
      }
      const session = await localAsrAPI.startInputSession({
        language: config.default_language,
        sampleRate: SAMPLE_RATE,
        maxRecordingSeconds: config.max_recording_seconds,
      });
      if (activeRunRef.current !== run) {
        await localAsrAPI.cancelInputSession(session.sessionId);
        return;
      }
      sessionRef.current = session;
      const recorder = await createVoiceInputRecorder({
        targetSampleRate: SAMPLE_RATE,
        chunkDurationMs: CHUNK_DURATION_MS,
        microphoneDeviceId: config.microphone_device_id || undefined,
        onChunk: pcm16Base64 => {
          appendQueueRef.current = appendQueueRef.current
            .then(async () => {
              const response = await localAsrAPI.appendAudioChunk(
                session.sessionId,
                pcm16Base64,
              );
              if (response.limitReached && activeRunRef.current === run) {
                void stopAndTranscribe();
              }
            })
            .catch(error => {
              appendErrorRef.current = error;
            });
        },
      });
      if (activeRunRef.current !== run) {
        await recorder.stop();
        await localAsrAPI.cancelInputSession(session.sessionId);
        return;
      }
      recorderRef.current = recorder;
      setPhase('recording');
      limitTimerRef.current = window.setTimeout(
        () => void stopAndTranscribe(),
        session.maxRecordingSeconds * 1_000,
      );
    } catch (error) {
      log.error('Failed to start local voice input', { error });
      const session = sessionRef.current;
      if (session) await localAsrAPI.cancelInputSession(session.sessionId).catch(() => undefined);
      notificationService.error(
        isPermissionDenied(error)
          ? t('input.voiceInput.permissionDenied')
          : t('input.voiceInput.failed'),
      );
      reset();
    }
  }, [config, openSettings, reset, stopAndTranscribe, t]);

  const toggle = useCallback(() => {
    if (phase === 'recording') {
      void stopAndTranscribe();
    } else if (phase === 'idle') {
      void start();
    }
  }, [phase, start, stopAndTranscribe]);

  const enabled = config?.enabled === true && isTauriRuntime();
  const platformSupported = isWindowsVoiceCaptureSupported();
  const tooltip = !platformSupported
    ? t('input.voiceInput.unsupported')
    : phase === 'recording'
    ? t('input.voiceInput.stop')
    : phase === 'preparing'
      ? t('input.voiceInput.preparing')
      : phase === 'transcribing'
        ? t('input.voiceInput.transcribing')
        : t('input.voiceInput.start');

  return {
    enabled,
    disabled: !platformSupported || phase === 'preparing' || phase === 'transcribing',
    phase,
    tooltip,
    toggle,
    cancel,
  };
}
