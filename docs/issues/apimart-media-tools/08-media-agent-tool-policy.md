# Issue 08: Grant Media Tools Through Agent Tool Policy

## What to build

Expose media tools to Media mode and future film-team subagents through tool policy, not through UI assumptions or prompt-only control. Code sessions should not receive paid media tools by default.

## Acceptance criteria

- [ ] Media mode default tools include APIMart media tools after those tools exist.
- [ ] Code mode does not include paid media tools by default.
- [ ] Future media subagents can opt into specific tools without duplicating provider code.
- [ ] Media prompt instructs agents to call media tools for real generation, upload, and status checks.
- [ ] Prompt forbids claiming generated assets without tool-provided URLs, paths, task IDs, or completed statuses.
- [ ] Registry tests cover allowed tool visibility for Media mode.
- [ ] Tests verify tools remain denied when not in an agent's allowed tool list.

## Blocked by

- Issue 03: Implement gpt-image-2 GenerateImage Tracer
- Issue 04: Implement GetMediaTaskStatus
- Issue 05: Implement Paid-Safe UploadMediaImage
- Issue 06: Implement Omni-Flash-Ext GenerateVideo Tracer
- Issue 07: Implement GenerateSpeech and TranscribeAudio
