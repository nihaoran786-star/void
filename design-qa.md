# Design QA: Session usage receipt

## Scope

- Source visual truth: the user-provided per-session report screenshot
- Aesthetic reference only: the user-provided global account analytics screenshot
- Implementation:
  - `src/web-ui/src/flow_chat/components/usage/SessionUsageReportCard.tsx`
  - `src/web-ui/src/flow_chat/components/usage/SessionUsageReportCard.scss`
- Automated contract:
  - `src/web-ui/src/flow_chat/components/usage/SessionUsageComponents.test.tsx`

The first source is the existing per-session report and defines the state and
content that must remain available. The second source is a global account
analytics page, so only its typography, continuous metric strip, spacing, and
low-noise visual hierarchy are applicable to this component.

## Capture conditions

- Theme: light
- State: completed partial session report with live context usage
- Desktop window capture: `1215 × 809`
- Full-view evidence: `session-usage-receipt-window.png` in the task's local
  visualization output
- Focused evidence: `session-usage-receipt-pass1-focus.png` in the same local
  visualization output

The desktop window was captured at its actual rendered size. The focused image
is a crop for detail inspection and is not treated as a separate viewport.

## Fidelity surfaces

| Surface | Source requirement | Implementation result |
| --- | --- | --- |
| Information identity | Per-session duration, tokens, cache, files, errors, model and tool details remain available | Preserved |
| Metric hierarchy | Values lead, muted labels follow | Matched |
| Metric container | One continuous low-noise strip with subtle separators | Matched |
| Context usage | Remains visible when live context data exists | Preserved as a text metric |
| Detail access | Copy, redaction and detail controls remain functional | Preserved |
| Performance | No decorative runtime work or new dependency | Improved by removing the animated SVG gauge |

## Findings and fixes

1. **P1 — The gauge competed with the actual session facts.**
   Removed the SVG ring and represented context usage in the same text metric
   grammar as the other facts.
2. **P2 — The previous metric arrangement read like nested dashboard cards.**
   Replaced it with a continuous horizontal strip and restrained separators.
3. **P2 — The compact card could silently lose live context information.**
   Added an explicit seven-metric state and a component contract test.
4. **P3 — Decorative entrance motion added work without communicating state.**
   Removed the report-card entrance animation.

## Verification history

- Pass 1: compared the original per-session report with the rendered desktop
  implementation and used the global analytics screenshot only as a style
  reference.
- Automated component contract: 39 tests passed.
- Web TypeScript check: passed.
- Theme color contract: passed with zero undefined variables.
- Theme visual contract: passed.

## Final result

Passed. No open P0, P1, or P2 visual-fidelity issue is attributable to this
change. Global usage analytics and account/profile settings remain separate
future modules and were not simulated inside the session receipt.
