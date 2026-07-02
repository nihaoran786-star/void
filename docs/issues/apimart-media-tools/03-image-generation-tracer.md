# Issue 03: Implement gpt-image-2 GenerateImage Tracer

## What to build

Implement the first paid async generation tracer: `GenerateImage` using `gpt-image-2` plus normalized submitted-job output. This should prove token loading, request submission, capability validation, error normalization, and tool result rendering without adding every image model at once.

## Acceptance criteria

- [ ] `GenerateImage` defaults to `gpt-image-2`.
- [ ] Tool accepts prompt, size, resolution, and optional image references.
- [ ] Tool rejects invalid `gpt-image-2` params before submitting.
- [ ] Tool returns normalized `{ status: "submitted", job_id, provider_task_id, model, poll_after_ms }`.
- [ ] APIMart errors normalize into stable error codes: auth, payment, rate limit, invalid input, provider unavailable, unknown.
- [ ] No upload occurs unless caller explicitly provides local image paths requiring public URLs.
- [ ] Tests use mocked APIMart responses and do not make network calls.

## Blocked by

- Issue 01: Add APIMart Media Token Settings
- Issue 02: Add Media Model Capability Registry
