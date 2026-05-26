# Issue 02: Add Media Model Capability Registry

## What to build

Add a typed capability registry for the first APIMart media models. This registry is the single source of truth for enum values, supported modalities, reference limits, default models, and mutually exclusive fields.

## Acceptance criteria

- [ ] Default image model is `gpt-image-2`.
- [ ] Default video model is `Omni-Flash-Ext`.
- [ ] `gpt-image-2` validates `n=1`, 15 documented ratio values plus pixel sizes, `resolution` values `1k/2k/4k`, and up to 16 reference images.
- [ ] Gemini Pro validates standard/official model variants, 1-4 outputs, 14 reference images, supported ratios, `1K/2K/4K`, and the `official_fallback` restriction.
- [ ] Gemini Flash validates standard/official model variants, 1-4 outputs, 14 reference images, long-ratio support, `0.5K/1K/2K/4K`, and Google search dependency.
- [ ] `Omni-Flash-Ext` validates duration `4/6/8/10`, resolution `720p/1080p/4k`, 0/1/3 image references only, max 1 video reference, and `duration` vs `video_urls` mutual exclusion.
- [ ] `doubao-seedance-2.0` validates documented model variants, duration 4-15, size enum, resolution restrictions, image/video/audio reference limits, and image role conflicts.
- [ ] `kling-v3-omni` validates mode enum, duration 3-15, aspect ratio enum, image role conflicts, max 1 video, max 6 multi prompts, and element reference constraints.
- [ ] Unit tests cover all supported enum and count boundaries.

## Blocked by

None - can start immediately.

