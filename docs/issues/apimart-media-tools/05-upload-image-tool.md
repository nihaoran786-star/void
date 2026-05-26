# Issue 05: Implement Paid-Safe UploadMediaImage

## What to build

Implement `UploadMediaImage` as a deliberate paid action for local image files that need public APIMart upload URLs. It should not be hidden inside generation tools except through explicit, validated service flow.

## Acceptance criteria

- [ ] Tool uploads to `POST /v1/uploads/images`.
- [ ] Supports jpeg, jpg, png, webp, and gif.
- [ ] Rejects files over 20MB before request.
- [ ] Returns URL, filename, content type, bytes, and created timestamp.
- [ ] Tool description clearly states upload may incur cost.
- [ ] Generation tools reuse existing public URLs and do not upload by default.
- [ ] Tests cover valid upload response, unsupported format, too large, missing file, auth failure, and rate limit.

## Blocked by

- Issue 01: Add APIMart Media Token Settings

