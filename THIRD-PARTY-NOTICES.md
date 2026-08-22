# Third-party notices

This file records third-party material absorbed into this repository, per the
attribution rules in
[docs/features/infinite-canvas-and-media-tools-prd.md](docs/features/infinite-canvas-and-media-tools-prd.md)
and the 2026-08-22 infinite-canvas phase-1 plan (§3).

## kunpeng

- **Project:** kunpeng (imported from a local checkout of the upstream
  repository; all source paths below are relative to its repository root)
- **License:** MIT
- **What we use:**
  - Style library data (161 live-action / 2D-animation style presets) from
    `aigc-memory/style-library/index.json`, converted into
    `src/web-ui/src/shared/services/style-preset/data/cinematicStyles.ts` and
    `data/animation2dStyles.ts`. Thumbnails were **not** copied (owner decision:
    option A, `thumbnailRef` left empty).
  - Midjourney style presets (60 api-tested + 24 director-calibrated = 84) from
    `src/lib/midjourney/testedStyles.json` and `src/lib/midjourney/styles.ts`,
    converted into `data/midjourneyStyles.ts`.
  - MG motion presets (72 curated styles) and the MotionRecipe enum structure
    from `src/lib/omni/styles.ts`, converted into `data/mgStyles.ts` and the
    `MgMotionRecipe` contract type.
  - Prompt-template, shot-pattern, and checklist reference documents (13
    Markdown files) from `aigc-memory/prompt-templates/`,
    `aigc-memory/shot-patterns/`, and `aigc-memory/checklists/`, converted into
    `data/promptTemplates.ts`.
  - Structural reference only (no code copied): the `ImageToolDef` tool
    definition semantics from `src/lib/canvas/imageTools.ts` and the
    `workshopRef` typed-reference protocol from `src/lib/workshop/canvasSync.ts`,
    both re-specified as Void contracts in the specification above.
- **Conversion:** data entered this repository through a one-off conversion
  script run outside the repository; kunpeng file formats are not passed
  through to the Void runtime. Each generated data file carries a header noting
  its source path and this notice.

### Original copyright notice (MIT License)

```
MIT License

Copyright (c) 2026 Kunpeng Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
