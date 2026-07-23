# Design QA: Account and session usage graphics

## Scope

- Source visual truth: the user-provided personal account analytics screenshot.
- Account implementation:
  - `src/web-ui/src/app/scenes/settings/components/AccountSettings.tsx`
  - `src/web-ui/src/app/scenes/settings/components/AccountSettings.scss`
- Session implementation:
  - `src/web-ui/src/flow_chat/components/usage/SessionUsageReportCard.tsx`
  - `src/web-ui/src/flow_chat/components/usage/SessionUsageReportCard.scss`
- Data boundary:
  - `src/apps/desktop/src/api/account_usage_api.rs`
  - `src/web-ui/src/app/account-usage/`

The reference is a personal account page. It defines the continuous metric
strip, calendar-style activity graphic, compact type scale, and low-noise
hierarchy. The session receipt borrows that visual grammar but continues to use
only the current session report.

## Capture evidence

- Theme: light
- Account state: anonymous identity with real local usage records
- Session state: completed partial report with live context usage
- Account capture: `account-usage-final-v2.png` in the task visualization output
- Session capture: `chat-current.png` in the task visualization output
- Combined source/implementation comparison:
  `account-reference-comparison.png` in the task visualization output

The captures come from the running Tauri desktop application. The combined
comparison was generated from the user reference and the actual account-page
capture; it is not a second simulated viewport.

## Fidelity review

| Surface | Reference requirement | Implementation result |
| --- | --- | --- |
| Page identity | Account/profile context above analytics | Preserved with anonymous/authenticated states |
| Metric hierarchy | Five continuous, evenly separated metrics | Matched |
| Activity | Calendar-style token activity with intensity levels | Matched using 365 days of real records |
| Typography | Compact values and muted support labels | Matched to the repository type scale |
| Session receipt | Same visual language with less text | Matched with token and time composition graphics |
| Detail access | Rich model/tool/file information remains available | Preserved behind the existing Details action |
| Empty/error data | No fabricated chart data | Explicit loading, empty, invalid, and unavailable states |
| Performance | Lightweight static graphics | CSS grid and bars only; no chart library or animation |

## Findings and corrections

1. **P1 — The initial account activity color was too close to the neutral
   surface.** Data cells now use the existing semantic information color at
   four intensities.
2. **P1 — The session card repeated verbose model, tool, and file lists.**
   Those rows remain in Details; the inline receipt now leads with five or six
   metrics and two compact graphics.
3. **P2 — Full time labels truncated in the narrow session visualization.**
   The final implementation uses short localized labels for model, tools, and
   recorded time.
4. **P2 — The reference includes metrics that this application does not
   currently record globally.** They were not simulated. The account strip
   uses total tokens, daily peak, active days, current streak, and longest
   streak.

## Verification

- Account and session component tests: 44 passed.
- Rust account-usage aggregation test: passed.
- Web TypeScript check: passed.
- Core boundary check: passed.
- Theme color and visual-contract checks: passed.
- i18n contract test: passed.
- Full i18n audit retains the known short-drama hardcoded-CJK baseline failure;
  this change adds no CJK source candidate.

final result: passed
