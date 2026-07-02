# Issue 11: Cache Telemetry Contract

## What to build

Expose provider/runtime prompt-cache telemetry through a stable runtime event
contract so cache behavior can be measured without UI components inferring it
from unrelated token counters.

## Acceptance criteria

- [x] Runtime events expose whether a model round was cache-eligible.
- [x] Runtime events expose cache hit/miss status when the provider reports it.
- [x] Runtime events preserve cached token count and cache miss reason when
      available.
- [x] Providers without cache telemetry report an explicit unsupported or
      unavailable source instead of omitting the state ambiguously.
- [x] Existing token usage UI and session usage reports keep working.

## Blocked by

None - can start immediately.

## Implementation status

Completed in the runtime/domain slice:

- Added `PromptCacheTelemetry` and cache status/source models in
  `src/crates/runtime-ports/src/lib.rs`.
- Added `promptCacheTelemetry` to token usage and model round events while
  preserving existing `cachedTokens` and `tokenDetails`.
- Frontend event/state types now preserve the field without adding UI business
  logic.
