export interface VoiceInputRecorder {
  stop: () => Promise<void>;
}

export interface VoiceInputRecorderOptions {
  targetSampleRate: number;
  chunkDurationMs: number;
  microphoneDeviceId?: string;
  onChunk: (pcm16Base64: string) => void;
}

export function resampleLinear(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) return input;
  const ratio = sourceSampleRate / targetSampleRate;
  const output = new Float32Array(Math.max(1, Math.floor(input.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(input.length - 1, left + 1);
    const weight = sourceIndex - left;
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

export function encodePcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(index * 2, pcm, true);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function appendSamples(current: Float32Array, next: Float32Array): Float32Array {
  if (current.length === 0) return next;
  const combined = new Float32Array(current.length + next.length);
  combined.set(current);
  combined.set(next, current.length);
  return combined;
}

export async function createVoiceInputRecorder({
  targetSampleRate,
  chunkDurationMs,
  microphoneDeviceId,
  onChunk,
}: VoiceInputRecorderOptions): Promise<VoiceInputRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone capture is unavailable');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(microphoneDeviceId ? { deviceId: { exact: microphoneDeviceId } } : {}),
    },
  });
  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextConstructor) {
    stream.getTracks().forEach(track => track.stop());
    throw new Error('AudioContext is unavailable');
  }

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let pending = new Float32Array(0);
  let stopped = false;
  try {
    context = new AudioContextConstructor();
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(4096, 1, 1);
    const activeContext = context;
    const activeSource = source;
    const activeProcessor = processor;
    const chunkSamples = Math.max(
      1,
      Math.floor(targetSampleRate * chunkDurationMs / 1000),
    );

    activeProcessor.onaudioprocess = event => {
      const input = event.inputBuffer.getChannelData(0);
      pending = appendSamples(
        pending,
        resampleLinear(input, activeContext.sampleRate, targetSampleRate),
      );
      while (pending.length >= chunkSamples) {
        onChunk(encodePcm16Base64(pending.slice(0, chunkSamples)));
        pending = pending.slice(chunkSamples);
      }
    };
    activeSource.connect(activeProcessor);
    activeProcessor.connect(activeContext.destination);

    return {
      stop: async () => {
        if (stopped) return;
        stopped = true;
        activeProcessor.disconnect();
        activeProcessor.onaudioprocess = null;
        activeSource.disconnect();
        if (pending.length > 0) onChunk(encodePcm16Base64(pending));
        pending = new Float32Array(0);
        stream.getTracks().forEach(track => track.stop());
        if (activeContext.state !== 'closed') await activeContext.close();
      },
    };
  } catch (error) {
    processor?.disconnect();
    if (processor) processor.onaudioprocess = null;
    source?.disconnect();
    stream.getTracks().forEach(track => track.stop());
    if (context && context.state !== 'closed') {
      await context.close().catch(() => undefined);
    }
    throw error;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
