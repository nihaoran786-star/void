# Issue 04: Implement GetMediaTaskStatus

## What to build

Implement `GetMediaTaskStatus` for APIMart async image and video tasks. It should normalize APIMart task status and outputs into the shared `MediaJob` shape.

## Acceptance criteria

- [ ] Tool calls `GET /v1/tasks/{task_id}` with `language=zh` by default.
- [ ] APIMart statuses map to normalized statuses: pending, processing, completed, failed, cancelled, expired.
- [ ] Image results return `MediaAsset(kind=image)` entries with URLs and `expires_at`.
- [ ] Video results return `MediaAsset(kind=video)` entries plus thumbnail when present.
- [ ] Failed tasks return normalized error details.
- [ ] Invalid/missing task IDs are rejected before request when possible.
- [ ] Tests cover completed image, completed video, processing, failed, invalid task, auth failure, and rate limit.

## Blocked by

- Issue 01: Add APIMart Media Token Settings
