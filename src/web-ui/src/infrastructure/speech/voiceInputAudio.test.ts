// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  createVoiceInputRecorder,
  encodePcm16Base64,
  resampleLinear,
} from './voiceInputAudio';

describe('voiceInputAudio', () => {
  it('resamples a mono buffer to the requested rate', () => {
    const result = resampleLinear(new Float32Array([0, 0.5, 1, 0.5]), 4, 2);

    expect(Array.from(result)).toEqual([0, 1]);
  });

  it('encodes clamped little-endian PCM16 samples', () => {
    const encoded = encodePcm16Base64(new Float32Array([-2, 0, 2]));
    expect(Array.from(Buffer.from(encoded, 'base64'))).toEqual([
      0x00, 0x80,
      0x00, 0x00,
      0xff, 0x7f,
    ]);
  });

  it('stops the microphone stream when audio graph setup fails', async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop }],
        })),
      },
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: undefined,
    });

    await expect(createVoiceInputRecorder({
      targetSampleRate: 16_000,
      chunkDurationMs: 1_000,
      onChunk: vi.fn(),
    })).rejects.toThrow('AudioContext is unavailable');
    expect(stop).toHaveBeenCalledOnce();
  });
});
