# Issue 06: Implement Omni-Flash-Ext GenerateVideo Tracer

## What to build

Implement the first video generation tracer with `GenerateVideo` defaulting to `Omni-Flash-Ext`. This should cover text-to-video, single-image-to-video, three-image fusion, and single reference video rules without adding the more complex Seedance and Kling variants yet.

## Acceptance criteria

- [ ] `GenerateVideo` defaults to `Omni-Flash-Ext`.
- [ ] Tool accepts prompt, duration, resolution, aspect ratio, image URLs, and video URLs.
- [ ] Tool supports text-to-video with no image/video references.
- [ ] Tool supports 1 image reference.
- [ ] Tool supports 3 image references.
- [ ] Tool rejects exactly 2 image references.
- [ ] Tool rejects 4 or more image references.
- [ ] Tool supports at most 1 video reference.
- [ ] Tool rejects `duration` when `video_urls` is present.
- [ ] Tool returns normalized submitted-job output.
- [ ] Tests cover all supported and rejected reference-count paths.

## Blocked by

- Issue 01: Add APIMart Media Token Settings
- Issue 02: Add Media Model Capability Registry
- Issue 04: Implement GetMediaTaskStatus
