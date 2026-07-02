# Media Result Interactions Issues

## Risk Boundary

- Do not modify APIMart request/response contracts.
- Do not change Rust media job persistence schema.
- Do not add a custom media player.
- Do not put preview or reference business logic in app entrypoints.
- Keep media card UI state local and keep backend payload mapping in the existing image-context utility.

## Issue 1: Preserve URL-backed media references through chat input

**Type:** AFK
**Blocked by:** None

### What to build

Allow an image context created from a generated media URL to be transported to the backend as an APIMart-compatible URL reference.

### Acceptance criteria

- [ ] URL image contexts are represented with `source: "url"` and a non-local image path/url.
- [ ] Backend image context payload preserves the URL as `image_path`.
- [ ] Existing clipboard/data-url image behavior is unchanged.
- [ ] Tests cover URL, data-url, and local image mapping.

## Issue 2: Add “use as reference” action to generated media assets

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Generated image assets show a hover action that adds the asset to the active chat input as a reference image and focuses the composer.

### Acceptance criteria

- [ ] Hovering a generated image shows a “引用” action.
- [ ] Clicking “引用” adds an image chip to the input without sending a message.
- [ ] Duplicate clicks on the same asset do not create duplicate contexts.
- [ ] Video/audio assets do not pretend to be image inputs if unsupported.

## Issue 3: Open generated media in an app-internal preview tab

**Type:** AFK
**Blocked by:** None

### What to build

Clicking an image, video, or audio result opens the media URL in the existing right-panel browser tab instead of an external browser.

### Acceptance criteria

- [ ] Asset click dispatches an `agent-create-tab` browser tab event.
- [ ] The tab title includes the media kind and item number.
- [ ] Re-clicking the same asset reuses or focuses the same tab.
- [ ] No `target="_blank"` external browser path remains for media assets.

## Issue 4: Polish media card summary, collapse, and generation animation

**Type:** AFK
**Blocked by:** None

### What to build

Media cards support clicking the header to collapse/expand and show a restrained animated generating state inspired by the provided loader, adapted to the current design system.

### Acceptance criteria

- [ ] Header click toggles card collapse without breaking asset actions.
- [ ] Polling cards show a compact animated generation strip.
- [ ] Completed cards show asset grid and counts.
- [ ] Failed/partial items remain visible when expanded.
- [ ] `prefers-reduced-motion` disables the animation.

## Issue 5: Verify end-to-end media result interactions

**Type:** AFK
**Blocked by:** Issues 1-4

### What to build

Run automated and desktop smoke verification for the full path.

### Acceptance criteria

- [ ] Frontend media tests pass.
- [ ] Type-check passes.
- [ ] Desktop smoke verifies reference click adds an input chip.
- [ ] Desktop smoke verifies media click opens the right-panel preview.
- [ ] Worktree contains no temporary docs or test artifacts.
