import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  existsSync,
  readdirSync,
} from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const requireFromWeb = createRequire(
  path.join(repoRoot, 'src', 'web-ui', 'package.json'),
)
const requireFromE2E = createRequire(
  path.join(repoRoot, 'tests', 'e2e', 'package.json'),
)
const sass = requireFromWeb('sass')
const puppeteer = requireFromE2E('puppeteer-core')

function findChromiumExecutable(root) {
  if (!root || !existsSync(root)) {
    return undefined
  }

  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(entryPath)
      } else if (
        entry.name.toLowerCase() === 'chrome.exe' &&
        /(?:chrome-win|chrome-win64)[\\/]/i.test(entryPath)
      ) {
        return entryPath
      }
    }
  }

  return undefined
}

const chromiumPath = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
    : undefined,
  process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, '.cache', 'puppeteer')
    : undefined,
]
  .map(findChromiumExecutable)
  .find(Boolean)

const compileScss = (...segments) =>
  sass.compile(path.join(repoRoot, ...segments), {
    style: 'expanded',
  }).css

const compileScssMixin = (...segments) => {
  const modulePath = segments.join('/').replace(/\.scss$/u, '')
  return sass.compileString(
    `@use "${modulePath}" as surface;\n@include surface.styles;`,
    {
      loadPaths: [repoRoot],
      style: 'expanded',
    },
  ).css
}

const durationIsEffectivelyZero = (value) =>
  value.split(',').every((duration) => {
    const normalized = duration.trim()
    if (normalized.endsWith('ms')) {
      return Number.parseFloat(normalized) <= 0.01
    }
    if (normalized.endsWith('s')) {
      return Number.parseFloat(normalized) <= 0.00001
    }
    return false
  })

test(
  'reduced-motion disables indefinite progress and collapses minimal workspace motion',
  {
    skip: chromiumPath
      ? false
      : 'No cached headless Chromium executable is available',
  },
  async () => {
    const aboutCss = compileScss(
      'src',
      'web-ui',
      'src',
      'app',
      'components',
      'AboutDialog',
      'AboutDialog.scss',
    )
    const shortDramaCss = compileScssMixin(
      'src',
      'web-ui',
      'src',
      'app',
      'components',
      'panels',
      'content-canvas',
      'short-drama',
      'ShortDramaCenterPanel.minimal.scss',
    )
    const mediaPreviewCss = compileScssMixin(
      'src',
      'web-ui',
      'src',
      'shared',
      'services',
      'preview',
      'MediaPreviewOverlay.minimal.scss',
    )
    const workspaceMediaCss = compileScssMixin(
      'src',
      'web-ui',
      'src',
      'app',
      'components',
      'panels',
      'content-canvas',
      'workspace-media',
      'WorkspaceMediaGallery.minimal.scss',
    )

    const browser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: true,
      args: [
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-crash-reporter',
        '--disable-gpu',
        '--no-first-run',
      ],
    })

    try {
      const page = await browser.newPage()
      await page.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ])
      await page.setContent(
        `<!doctype html>
<html>
  <head>
    <style>
      ${aboutCss}
      ${shortDramaCss}
      ${workspaceMediaCss}
      ${mediaPreviewCss}
      .motion-probe {
        animation: motion-probe 5s linear infinite;
        transition: transform 5s linear;
      }
      @keyframes motion-probe {
        from { transform: translateX(0); }
        to { transform: translateX(100px); }
      }
    </style>
  </head>
  <body>
    <div
      id="about"
      class="void-about-dialog__download-fill void-about-dialog__download-fill--indeterminate"
    ></div>
    <div class="void-ui--minimal">
      <div class="short-drama-center">
        <div id="short-drama" class="motion-probe"></div>
      </div>
    </div>
    <div class="media-preview-overlay void-ui--minimal">
      <div id="media-preview" class="motion-probe"></div>
    </div>
    <div class="void-ui--minimal">
      <div class="workspace-media-gallery">
        <div id="workspace-media" class="motion-probe"></div>
      </div>
    </div>
  </body>
</html>`,
        { waitUntil: 'domcontentloaded' },
      )

      const result = await page.evaluate(() => {
        const snapshot = (id) => {
          const style = getComputedStyle(document.getElementById(id))
          return {
            animationName: style.animationName,
            animationDuration: style.animationDuration,
            animationIterationCount: style.animationIterationCount,
            transitionDuration: style.transitionDuration,
          }
        }

        return {
          reducedMotion: matchMedia(
            '(prefers-reduced-motion: reduce)',
          ).matches,
          about: snapshot('about'),
          shortDrama: snapshot('short-drama'),
          workspaceMedia: snapshot('workspace-media'),
          mediaPreview: snapshot('media-preview'),
        }
      })

      assert.equal(result.reducedMotion, true)
      assert.equal(result.about.animationName, 'none')
      assert.ok(durationIsEffectivelyZero(result.about.transitionDuration))

      for (const [name, surface] of [
        ['short drama', result.shortDrama],
        ['workspace media', result.workspaceMedia],
        ['media preview', result.mediaPreview],
      ]) {
        assert.ok(
          durationIsEffectivelyZero(surface.animationDuration),
          `${name} animation remained ${JSON.stringify(surface)}`,
        )
        assert.ok(
          durationIsEffectivelyZero(surface.transitionDuration),
          `${name} transition remained ${JSON.stringify(surface)}`,
        )
        assert.equal(
          surface.animationIterationCount,
          '1',
          `${name} iteration count remained ${JSON.stringify(surface)}`,
        )
      }
    } finally {
      await browser.close()
    }
  },
)
