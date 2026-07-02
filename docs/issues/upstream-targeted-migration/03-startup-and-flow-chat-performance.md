# Issue 3: Startup And Flow Chat Performance

## What to build

Adapt upstream startup and flow-chat performance work in void naming while
keeping desktop startup, right panel layout, and media preview behavior stable.

## Acceptance criteria

- [ ] Startup trace exposes sanitized diagnostics without raw paths or payloads.
- [ ] Startup overlay uses void ids/names and keeps the splash first frame
      stable.
- [ ] Expensive editor or AI initialization is deferred only when it does not
      break desktop dev or media panel startup.
- [ ] Large history and streaming code preview rendering avoid unnecessary
      work.
- [ ] Media preview panel remains mountable and responsive after startup.

## Blocked by

- Issue 1 should complete first if chat-input files overlap.

