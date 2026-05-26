# Issue 07: Implement GenerateSpeech and TranscribeAudio

## What to build

Implement APIMart audio tools for synchronous text-to-speech and transcription. These should return concrete assets or transcript content and should not use the async media task status flow.

## Acceptance criteria

- [ ] `GenerateSpeech` calls `POST /v1/audio/speech`.
- [ ] `GenerateSpeech` validates model `gpt-4o-mini-tts`, input length <= 4096, voice enum, response format enum, and speed 0.25-4.0.
- [ ] `GenerateSpeech` handles binary audio response and returns a usable local asset or bytes-backed result according to existing tool result conventions.
- [ ] `TranscribeAudio` calls `POST /v1/audio/transcriptions` with multipart form data.
- [ ] `TranscribeAudio` validates allowed file formats and max size 25MB.
- [ ] `TranscribeAudio` supports `json`, `text`, `srt`, `verbose_json`, and `vtt` output handling.
- [ ] Tests cover successful speech, speech JSON error response, successful transcription, subtitle response formats, invalid file type, oversized file, and auth failure.

## Blocked by

- Issue 01: Add APIMart Media Token Settings
- Issue 02: Add Media Model Capability Registry

