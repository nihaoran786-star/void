# Media Generation Preview Placeholders Issues

## Parent

Design request: right preview Media gallery should show generation-in-progress placeholders that match requested media count and aspect ratio, then replace them with generated image/video assets when ready. Media task polling should avoid early wasted requests by waiting 20 seconds before the first status query, then polling every 5 seconds.

## Risk Boundary

- This is a media task presentation and polling cadence improvement, not a new media generation provider.
- Do not change BrowserPanel, APIMart client endpoint contracts, backend session schema, chat session mode, or media card grouping behavior.
- Do not let the right Media gallery infer generation state from chat message text or React chat card state.
- Keep APIMart/provider response parsing inside media job/tool layers.
- Keep filesystem/job scanning inside workspace media services, not React page components.
- Keep UI components rendering normalized pending/ready media view models only.
- Pending placeholders are presentation state derived from persisted media job records; they are not new sessions, new tasks, or fake generated assets.

## Proposed Vertical Slices

1. **Media polling cadence adjustment**
   - **Type:** AFK
   - **Blocked by:** None

2. **Media generation placeholder metadata**
   - **Type:** AFK
   - **Blocked by:** None

3. **Workspace media pending generation scanner**
   - **Type:** AFK
   - **Blocked by:** Issue 2

4. **Right Media gallery generation placeholder UI**
   - **Type:** AFK
   - **Blocked by:** Issue 3

5. **Completion replacement and refresh behavior**
   - **Type:** AFK
   - **Blocked by:** Issues 3-4

6. **Verification and regression hardening**
   - **Type:** HITL
   - **Blocked by:** Issues 1-5

## Issue 1: Media polling cadence adjustment

**Type:** AFK
**Blocked by:** None

### What to build

Change background APIMart media polling so a submitted image/video job immediately persists local `polling` job state, waits 20 seconds before the first remote status query, then polls remaining pending tasks every 5 seconds.

### Acceptance criteria

- [ ] Submitting `GenerateImage` still immediately returns a polling tool result with task IDs.
- [ ] Submitting `GenerateVideo` still immediately returns a polling tool result with task IDs.
- [ ] The persisted `.void/media-jobs/{batch_id}.json` polling state is written before the initial 20 second wait.
- [ ] The first `get_task_status` call is delayed by 20 seconds after submission.
- [ ] Subsequent status checks run every 5 seconds while tasks remain pending.
- [ ] Returned/persisted metadata includes `initial_delay_seconds: 20` and `poll_interval_seconds: 5`.
- [ ] Timeout/max-attempt behavior remains bounded and explicit.
- [ ] Tests cover initial delay placement, persisted polling state before delay, and 5 second follow-up cadence without waiting in real time.

## Issue 2: Media generation placeholder metadata

**Type:** AFK
**Blocked by:** None

### What to build

Normalize generation request metadata into media job results so the UI can render accurate pending placeholders without parsing tool input or provider-specific response shapes.

### Acceptance criteria

- [ ] `GenerateImage` persists a requested count derived from `n`, then task count, then fallback `1`.
- [ ] `GenerateImage` persists a requested aspect ratio derived from `size` when it is a supported ratio such as `9:16`, `16:9`, or `21:9`.
- [ ] `GenerateImage` maps `auto` or missing ratio to a safe placeholder fallback.
- [ ] `GenerateVideo` persists a requested count derived from task IDs, then fallback `1`.
- [ ] `GenerateVideo` persists a requested aspect ratio derived from `aspect_ratio`, then `size`, then a safe video fallback.
- [ ] Metadata is stored in a normalized field, for example `batch.requested_count`, `batch.requested_aspect_ratio`, and `batch.placeholder_aspect_ratio`.
- [ ] The normalized placeholder aspect ratio uses CSS-safe syntax such as `9 / 16`.
- [ ] Tool card behavior remains unchanged except for any existing text that displays poll cadence.
- [ ] Tests cover image `n + size`, image `auto`, video `aspect_ratio`, video `size`, missing values, and invalid ratio fallback.

## Issue 3: Workspace media pending generation scanner

**Type:** AFK
**Blocked by:** Issue 2

### What to build

Extend the workspace media service layer to scan active `.void/media-jobs` records and expose normalized pending generation entries alongside ready workspace media items.

### Acceptance criteria

- [ ] Workspace media service reads `.void/media-jobs/*.json` through the existing filesystem adapter boundary.
- [ ] Pending generation entries are returned only for active statuses such as `polling` with pending items.
- [ ] Completed, failed, timeout, or partial records do not create misleading pending placeholders for completed/failed items.
- [ ] Pending entries expose stable IDs, kind, batch ID, item index, requested aspect ratio, placeholder aspect ratio, prompt/model when available, and started/updated time when available.
- [ ] The service does not read chat message state, tool card React props, BrowserPanel state, or APIMart directly.
- [ ] Malformed job JSON is skipped or reported through an explicit non-fatal warning state without breaking normal media scanning.
- [ ] Existing generated media file scanning remains unchanged.
- [ ] Tests cover active job, completed job ignored, malformed job handling, count expansion, ratio propagation, and no workspace behavior.

## Issue 4: Right Media gallery generation placeholder UI

**Type:** AFK
**Blocked by:** Issue 3

### What to build

Render pending generation entries in the right Media gallery as polished placeholder cards using the same count and aspect ratio requested by the generation job.

### Acceptance criteria

- [ ] A pending 9:16 image job renders 9:16 placeholder cards.
- [ ] A pending 16:9 video job renders 16:9 placeholder cards.
- [ ] A pending 21:9 job renders 21:9 placeholder cards.
- [ ] Multiple requested outputs render the same number of placeholder cards.
- [ ] Placeholder cards use a laser/scanline/drawing animation that feels native to the app, not a generic gray skeleton.
- [ ] Placeholder animation uses stable dimensions and does not cause masonry layout jumps during animation.
- [ ] Placeholder cards clearly indicate generating state without pretending a file already exists.
- [ ] Placeholder cards are not clickable as media preview until a real asset exists.
- [ ] `prefers-reduced-motion: reduce` disables high-motion effects while keeping a clear static pending state.
- [ ] Tests cover placeholder count, CSS aspect ratio, non-clickable behavior, and reduced-motion class/style presence where practical.

## Issue 5: Completion replacement and refresh behavior

**Type:** AFK
**Blocked by:** Issues 3-4

### What to build

Make pending placeholders naturally disappear when generated files are saved and the Media gallery refreshes, so the finished image/video cards become the visible result.

### Acceptance criteria

- [ ] When a job is active and no files are ready, pending placeholders appear.
- [ ] When generated files are saved, normal ready media tiles appear through existing media file scanning.
- [ ] Completed job records do not continue rendering pending placeholders.
- [ ] Manual refresh updates both pending job records and ready media files.
- [ ] Existing preview behavior for finished image/video/audio files is unchanged.
- [ ] Placeholder and ready file tiles do not duplicate the same completed output after refresh.
- [ ] Sorting remains understandable, with active pending jobs placed near recent generated assets.
- [ ] Tests cover active-to-completed transition, manual refresh, and no duplicate pending placeholders after completion.

## Issue 6: Verification and regression hardening

**Type:** HITL
**Blocked by:** Issues 1-5

### What to build

Run focused automated and desktop verification for polling cadence, pending placeholders, completion replacement, and unrelated media/gallery behavior.

### Acceptance criteria

- [ ] Relevant Rust media job/tool tests pass.
- [ ] Relevant frontend workspace media tests pass.
- [ ] Frontend type-check passes.
- [ ] `git diff --check` passes.
- [ ] Manual desktop verification: submit a 9:16 image generation request and see matching vertical placeholders before output arrives.
- [ ] Manual desktop verification: submit a 16:9 or 21:9 video generation request and see matching wide placeholders before output arrives.
- [ ] Manual desktop verification: generated outputs replace pending placeholders after refresh/completion.
- [ ] Manual desktop verification: audio previews, existing media gallery filtering, lightweight preview overlay, chat tool cards, BrowserPanel, and compact chat floating window are unaffected.
- [ ] Network observation or logs confirm the first APIMart status query waits about 20 seconds, then repeats about every 5 seconds while pending.

## Open Review Questions

- Should active pending jobs auto-refresh the Media gallery at a low frequency, or should MVP rely on existing manual refresh plus file scan on panel open?
- Should failed/timeout jobs show a compact failed placeholder in the Media gallery, or remain visible only in chat tool cards?
- Should placeholder ordering be newest job first even when finished files are sorted by file modified time?
