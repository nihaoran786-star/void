# APIMart Media Tools PRD

## Problem Statement

void now has a Media session mode, but it cannot yet execute real image, video, upload, text-to-speech, or transcription requests. The user has provided the first batch of APIMart API examples. All media requests use `https://api.apimart.ai` and a single bearer token, but the models have different parameters, supported input combinations, polling behavior, result shapes, and cost risks.

The main problem is not just adding HTTP calls. The product needs a safe tool architecture so Media agent and future multi-agent film teams can generate assets without letting prompts, UI components, or agent entrypoints guess provider behavior, fabricate job results, or accidentally trigger paid uploads.

## Solution

Add APIMart-backed media tools as global runtime tools, gated by agent tool policy and a single media token in settings. The Media session should default to the most cost-effective models:

- Image default: `gpt-image-2`
- Video default: `Omni-Flash-Ext`

The tools should expose explicit actions:

- Upload a local image only when a public URL is required.
- Submit image generation jobs.
- Submit video generation jobs.
- Query media task status.
- Generate speech.
- Transcribe audio.

The implementation must centralize APIMart request logic in a media service and adapter layer. Tool implementations should validate inputs and call the service. UI should only store configuration and render state. Prompts should only instruct the agent when tools must be used.

## User Stories

1. As a Media session user, I want to configure one APIMart media token, so that all image, video, upload, and audio tools can use the same provider credential.
2. As a Media session user, I want image generation to default to `gpt-image-2`, so that I use the lowest-cost default unless I choose another model.
3. As a Media session user, I want video generation to default to `Omni-Flash-Ext`, so that text-to-video and simple image-to-video tasks use the lowest-cost default.
4. As a Media session user, I want generation tools to return task IDs instead of pretending results are ready, so that async work is honest and traceable.
5. As a Media session user, I want a task-status tool, so that I can poll image and video jobs until results are completed, failed, or expired.
6. As a Media session user, I want local images uploaded only when needed, so that I avoid unnecessary paid upload calls.
7. As a Media session user, I want public image URLs to be reused directly, so that the app does not re-upload assets that are already usable.
8. As a Media session user, I want multiple reference images to be validated per model, so that invalid counts are rejected before spending money.
9. As a Media session user, I want `gpt-image-2` to allow up to 16 reference images, so that image-to-image workflows can use its larger reference capacity.
10. As a Media session user, I want Gemini image models to allow up to 14 reference images, so that model-specific limits are respected.
11. As a Media session user, I want `Omni-Flash-Ext` to reject exactly 2 reference images, so that I do not submit a known unsupported request.
12. As a Media session user, I want `Omni-Flash-Ext` to support 0, 1, or 3 image references, so that I can use text-to-video, single-image animation, or three-image fusion correctly.
13. As a Media session user, I want `Omni-Flash-Ext` video reference mode to reject duration, so that mutually exclusive parameters do not cause provider errors.
14. As a Media session user, I want `doubao-seedance-2.0` to support image, audio, and video references within documented limits, so that richer workflows can be added without guessing capabilities.
15. As a Media session user, I want `kling-v3-omni` to support image references, image roles, video editing, multi-shot prompts, elements, and audio mode with its documented mutual exclusions.
16. As a Media session user, I want audio generation to save or return a concrete audio asset, so that TTS results are usable outside chat.
17. As a Media session user, I want transcription to return text or subtitle formats based on the requested response format, so that audio workflows can feed scripts and subtitles.
18. As a future film-team subagent, I want media tools to be globally available through tool policy, so that specialized agents can generate assets without duplicating provider code.
19. As a developer, I want model capabilities encoded in a typed registry, so that prompts and UI cannot drift from provider constraints.
20. As a developer, I want APIMart errors normalized, so that authentication, payment, rate limit, invalid input, and provider outages are handled consistently.
21. As a developer, I want tests around tool/service behavior, so that implementation details can change without breaking agent contracts.

## Implementation Decisions

- Use one APIMart media provider configuration with a fixed base URL of `https://api.apimart.ai`.
- Add a single token setting for APIMart media tools. Do not ask the user for base URL in the first phase.
- Register media tools globally, but only add them to Media mode and future media subagents through `default_tools` or mode tool policy.
- Keep provider HTTP details out of UI components, prompts, and agent definitions.
- Add a media domain service that owns validation, request construction, response normalization, and APIMart error mapping.
- Add an APIMart adapter for:
  - `POST /v1/uploads/images`
  - `POST /v1/images/generations`
  - `POST /v1/videos/generations`
  - `GET /v1/tasks/{task_id}?language=zh`
  - `POST /v1/audio/speech`
  - `POST /v1/audio/transcriptions`
- Represent async media work with a normalized job state:

```text
MediaJobStatus = pending | submitted | processing | completed | failed | cancelled | expired

MediaJob = {
  job_id,
  provider_task_id,
  kind,
  model,
  status,
  progress,
  outputs,
  error,
  created,
  completed,
  estimated_time,
  actual_time
}
```

- Represent generated or uploaded assets with:

```text
MediaAsset = {
  kind: image | video | audio | transcript,
  url?,
  local_path?,
  expires_at?,
  filename?,
  content_type?,
  bytes?
}
```

- Use model capability metadata to validate allowed inputs before submitting paid calls.
- Do not auto-upload local images unless the selected model/input path requires a public URL and no usable URL is already provided.
- Default image model is `gpt-image-2`; default video model is `Omni-Flash-Ext`.
- First implementation should prove the smallest paid async loop with `GenerateImage` using `gpt-image-2` and `GetMediaTaskStatus`.
- Batch generation should be a later orchestration layer; the first tools should accept clear arrays but avoid hidden fan-out.

## Testing Decisions

- Tests should cover public behavior of tools and service interfaces, not internal HTTP construction details except where request shape is the contract.
- Unit tests should cover capability validation for every supported model:
  - image count limits
  - enum values
  - mutually exclusive fields
  - upload requirement decisions
  - cheapest default model selection
- Adapter tests should use mocked APIMart responses for success, invalid request, auth failure, payment required, rate limit, and provider outage.
- Tool tests should assert normalized result shape: submitted jobs, completed jobs, failed jobs, uploaded assets, binary TTS handling, and transcription responses.
- Settings tests should verify that the token can be saved, read, cleared, and does not require a user-provided base URL.
- Prompt/registry tests should verify Media mode includes media tools only after the tools exist and does not grant them to code sessions by default.

## Out of Scope

- R2 storage integration.
- Full media asset library UI.
- Automatic batch short-drama production orchestration.
- Provider model discovery.
- User-facing cost estimation beyond static warnings.
- Webhook/callback support.
- Real video generation smoke tests without explicit user approval.
- Uploading video/audio assets as APIMart asset URLs for Seedance avatar workflows.

## Further Notes

- Uploading images is paid, so upload decisions must be explicit and testable.
- Some APIMart task result URLs expire. The tool output must surface `expires_at`.
- `Omni-Flash-Ext` is the default video model because the user identified it as the cheapest option.
- `gpt-image-2` is the default image model because the user identified it as the cheapest option.
- Future media-team subagents can reuse the same tools by adding tool policy permissions without changing provider adapters.
