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
    `data/animation2dStyles.ts`.
  - Style thumbnails (all 161 images) from `aigc-memory/style-library/`
    (`live-action/` 67 + `2d-animation/` 94), re-encoded offline to
    long-edge 320px WebP (quality ~72, EXIF stripped, ≤48 KB each) and stored as
    `src/web-ui/public/style-presets/<family>/<presetId>.webp`; the
    corresponding `thumbnailRef` fields in `cinematicStyles.ts` and
    `animation2dStyles.ts` are populated. Original filenames (CJK / spaces) were
    not preserved — files are named by our own `presetId`. See the
    **Style thumbnails: licence status** note below.
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

### Style thumbnails: licence status (recorded 2026-08-26)

This note records, without softening, what is and is not covered for the 161
style thumbnails listed above.

- **Upstream licence:** kunpeng is MIT-licensed, and the MIT notice reproduced
  below is carried accordingly.
- **Upstream made no third-party declaration for these images.** kunpeng's own
  `THIRD-PARTY-NOTICES.md` (60 lines) contains **no entry at all** for the style
  library; searching that repository for `style-library` / `aigc-memory` returns
  zero hits. We therefore have **no upstream statement of provenance** for the
  image files themselves.
- **Some of these thumbnails are named after, and depict material drawn from,
  third-party works.** The upstream filenames include titles such as 原神
  (Genshin Impact), 千与千寻 (Spirited Away), 双城之战 (Arcane), JOJO的奇妙冒险
  (JoJo's Bizarre Adventure), 名侦探柯南 (Detective Conan), LEGO, Minecraft,
  GTA, 权力的游戏 (Game of Thrones), and named Wes Anderson films; the image
  content follows those works. Renaming the files to `presetId` on import
  changes our file tree, **not** the content of the images.
- **The MIT licence does not, and cannot, cover the third-party rights in what
  these images depict.** MIT covers kunpeng's own code and data; it conveys no
  rights in the underlying franchises, characters, or films. Shipping these
  thumbnails in our installer therefore carries a residual third-party IP risk
  that this notice does not resolve.
- **Owner decision:** on **2026-08-26**, after being informed of every point
  above, the repository owner explicitly chose to import **all 161 thumbnails**
  (option B of the P5 plan, §7 item 2). This entry exists so that the decision
  and the risk it accepts remain traceable.
- Anyone revisiting this decision should read
  `docs/plans/2026-08-26-infinite-canvas-p5-creation.md` §2.4 and §7, and
  `docs/features/infinite-canvas-and-media-tools-prd.md` §2.

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
