# Theme normalization audit — 2026-07-25

This checkpoint audits the Minimal presentation of Assistant, Automation, and
Professional Agents in the real desktop shell. It is dated evidence, not a
permanent statement of repository quality.

## Audit health score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Accessibility | 3/4 | Interactive controls expose visible labels or accessible names and retain focus styling. Compact 28px filter chips remain a desktop-first target and need a separate touch-input policy before claiming full AA target sizing. |
| Performance | 4/4 | Agent cards use `content-visibility`, bounded intrinsic sizing, and reduced-motion fallbacks. The audited pages introduce no decorative media, blur, or unbounded animation. |
| Responsive design | 3/4 | Assistant and Automation have zero document overflow at a 719px WebView. Professional Agents originally clipped its second filter group; the remediation below makes every filter control visible with zero overflow. |
| Theming | 4/4 | Audited Minimal surfaces consume workspace color, typography, spacing, radius, focus, and status tokens. No new literal color is required by the remediation. |
| Anti-patterns | 3/4 | Hierarchy is compact and restrained. Professional Agents still relies heavily on repeated equal-weight cards, which is functional but weakens scan hierarchy for large catalogs. |
| **Total** | **17/20** | **Good — remaining debt is refinement rather than a structural redesign.** |

## Anti-pattern verdict

The audited pages do not present the usual gradient, glow, glass, oversized
metric, or decorative hero-image signatures. Professional Agents does retain a
dense repeated-card catalog; this is a P3 hierarchy concern, not a reason to
replace the working gallery or add decorative imagery.

## Findings

### P1 — Narrow Professional Agents filters were clipped

- **Location:** `src/web-ui/src/app/scenes/agents/AgentsScene.minimal.scss`
- **Category:** Responsive design
- **Impact:** At a 719px WebView, the `来源` and `类型` groups each inherited
  `width: 100%` while their parent forced `flex-wrap: nowrap`. The second group
  started beyond the content viewport, hiding the `智能体` and `子智能体`
  controls without a visible overflow affordance.
- **Remediation:** At 720px and below, the Minimal projection now wraps filter
  groups and disables the conflicting horizontal overflow rule. Runtime agent
  filtering, counts, creation, and gallery data remain unchanged.
- **Evidence:** Before remediation the second group occupied x=697–1119 in a
  719px WebView and three controls were outside the viewport. After remediation
  both rows occupy x=268–689, all five filter buttons are inside the viewport,
  and document width remains 719/719.

### P2 — Compact controls do not yet define a touch-input policy

- **Location:** Shared gallery chips and Automation toolbar controls
- **Category:** Accessibility / responsive design
- **Impact:** The 28px controls are precise for mouse-driven desktop use but do
  not independently satisfy a 44px touch-target recommendation on hybrid
  devices.
- **Recommendation:** Add a pointer-coarse presentation override at the shared
  gallery and toolbar layer rather than enlarging desktop controls globally.

### P3 — Large agent catalogs have uniform card emphasis

- **Location:** Professional Agents gallery
- **Category:** Anti-pattern / information hierarchy
- **Impact:** Core agents, teams, and the general catalog are separated by
  headings, but repeated equal-weight cards make long scans visually uniform.
- **Recommendation:** Preserve the existing card component and progressively
  disclose secondary metadata on narrow views; do not introduce decorative
  portraits or another card implementation.

### Resolved follow-up — Skills search controls over-expanded on wide layouts

- **Location:** `src/web-ui/src/app/scenes/skills/SkillsScene.minimal.scss`
- **Category:** Responsive design / design-system consistency
- **Impact:** The installed Skills search inherited `flex: 1` and expanded to
  1,063px at a maximized WebView, while the Market search occupied 469px.
  Both became the dominant visual surface despite being secondary toolbar
  controls.
- **Remediation:** The Minimal projection gives both search controls the same
  360px wide-layout axis. Installed Skills keeps `margin-right: auto` so its
  existing duplicate and add actions remain right-aligned. Existing
  container/media rules still promote both controls to the full available
  width on narrow layouts.
- **Evidence:** Maximized desktop measurements are 360px for both installed
  and Market search. At a 719px WebView they adapt to 431px and 423px
  respectively, and the document remains 719/719 with no horizontal overflow.
  Search, filtering, installation, pagination, and persistence paths are
  unchanged.

### Resolved follow-up — Gallery zone counts looked interactive

- **Location:** `src/web-ui/src/app/components/GalleryLayout/GalleryLayout.minimal.scss`
  and feature-local Gallery projections
- **Category:** Visual hierarchy / anti-pattern
- **Impact:** Passive zone totals in Assistant, Professional Agents, and Mini
  Apps used the same bordered 28px badge geometry as interactive controls.
  Assistant also inherited `margin-left: auto`, placing its count roughly
  900px away from the section title.
- **Remediation:** The shared Minimal Gallery projection now presents zone
  totals as borderless tabular metadata. Feature-local 28px overrides in
  Professional Agents and Mini Apps were removed; Assistant retains only its
  intentional title-adjacent alignment. Interactive filter counts remain
  compact badges.
- **Evidence:** At maximized width the count moves from x=1509 to x=531 beside
  the heading; at a 719px WebView it remains beside the heading at x=390. The
  Agents zone totals resolve to 6–13px text bounds without borders while its
  five filter counts retain 16–21px badge bounds. The user filter still changes
  the visible agent catalog from 10 to 5 and restores to the built-in filter.
  Full and 719px documents have zero horizontal overflow.

### Resolved follow-up — Office examples crowded the new-task heading

- **Location:** `src/web-ui/src/app/scenes/session/ChatPane.scss`
- **Category:** Onboarding hierarchy / responsive design
- **Impact:** The optional office examples started before the session-type
  switch had ended, visually crowding the fixed new-task heading even though
  the examples were already outside normal document flow.
- **Remediation:** The examples remain absolutely positioned so their content
  cannot move the heading or type switch. Their content axis is reduced from
  400px to 340px, cards from 26px to 24px, and the group now begins below the
  type switch with a stable gap.
- **Evidence:** At maximized width the heading and switch retain their original
  y=254 and y=292 positions; the switch ends at y=323 and examples begin at
  y=340. At a 719×498 WebView the switch ends at y=190 and examples begin at
  y=199. Both documents retain zero horizontal overflow.

## Positive findings

- Assistant reflows its two cards to one column at 719px without horizontal
  overflow or duplicated controls.
- Automation preserves all day/week/month/list actions at 719px and keeps its
  calendar grid within the scene container.
- Professional Agents uses a bounded content axis, semantic workspace tokens,
  visible focus treatment, reduced-motion rules, and deferred card rendering.

## Next actions

1. Apply the shared pointer-coarse target policy only after verifying the
   desktop shell reports coarse input accurately.
2. Continue `$normalize` on Assistant configuration and Mini App customization
   detail pages; the Connector entry currently and intentionally reuses the
   Settings/MCP interface rather than mounting a separate catalog.
3. Finish with `$polish` after the remaining catalog pages pass maximized and
   719px desktop checks.
