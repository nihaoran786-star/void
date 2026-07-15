# Web UI i18n bootstrap lazy-loading boundary

## Goal

Keep the default `zh-CN` locale and the global `en-US` fallback synchronously
available while removing the nine `zh-TW` bootstrap JSON modules from the Web UI
startup graph. Translation content, namespace ownership, locale identity, and
surface call sites are unchanged.

## Module boundary

`I18nService.ts` remains the only assembly and loading boundary:

- The eager glob contains the nine JSON bootstrap namespaces for `zh-CN` and
  `en-US` only: `common`, `components`, `errors`, `flow-chat`, `panels/files`,
  `panels/git`, `settings/ai-model`, `settings/lsp`, and `tools`.
- Shared terms are generated TypeScript resources rather than locale JSON. They
  remain synchronously available for every locale and are not counted among the
  nine JSON bootstrap modules.
- The lazy glob positively includes the full locale JSON tree, then uses one
  negative literal per eager module. This prevents duplicate dynamic entries for
  the 18 eager modules while retaining every non-bootstrap namespace and all nine
  `zh-TW` bootstrap JSON modules as dynamic imports.
- UI components continue to render i18n state and use the existing service/hook
  interfaces. They do not infer whether a resource was eager or dynamic.

No page, route, API, translation resource, generated locale contract, or backend
adapter participates in this change.

## State and loading semantics

Construction uses `initImmediate: false`. The default `zh-CN` bootstrap resources
and its `en-US` fallback are therefore usable by synchronous module-level
`i18nService.t(...)` calls as soon as the service is constructed.

Changing to `zh-TW` keeps the existing transaction:

1. Set the store's `isChanging` flag and run the before-change hook/event.
2. Load the requested locale and generated fallback chain for the bootstrap set
   plus namespaces already requested by features. Existing resource bundles are
   skipped, so the eager `zh-CN`/`en-US` fallback bundles are not fetched again.
3. Commit the i18next language, service locale, document language/direction, store
   locale, persistence call, and after-change hook/event.
4. Clear `isChanging` in `finally`.

The locale is not committed until all required dynamic imports succeed. A failed
import follows the existing error event and rejected `changeLanguage` path; it
does not silently present a partially loaded `zh-TW` state.

## Contract and manifest gates

`scripts/i18n-contract.test.mjs` parses the literal arguments of both named
`import.meta.glob` calls. It derives the nine JSON namespaces from
`WEB_UI_BOOTSTRAP_NAMESPACES`, derives the eager locales from the canonical Web UI
default plus global fallback, and asserts:

- the eager positive set is exactly `zh-CN/en-US × 9`;
- the lazy positive set is exactly the complete locale JSON tree;
- the lazy negative set is exactly the 18 eager modules;
- `zh-TW × 9` remains in the dynamic set; and
- the Web performance budget requires the corresponding nine Vite manifest keys.

The focused service tests separately prove default-locale synchronous access,
synchronous `en-US` fallback, and resource absence-before/presence-after a
`zh-TW` language switch.

`scripts/web-performance-budget.json` lists the nine `src/locales/zh-TW/...json`
keys under `requiredDynamicEntries`. The production performance check must see
each key as a dynamically reachable, non-static Vite manifest entry. JavaScript
raw and gzip limits are updated only from the production manifest build recorded
below.

## Production evidence

The 2026-07-16 production build used Vite 7.3.6 with `--manifest` and transformed
7,428 modules. The performance gate passed and proved all nine required `zh-TW`
bootstrap entries are dynamically reachable and absent from the static entry
closure.

- Entry JavaScript raw: `2,596,578 -> 2,399,468` bytes (`-197,110`, `-7.59%`).
- Entry JavaScript gzip: `767,953 -> 698,817` bytes (`-69,136`, `-9.00%`).
- Entry CSS: unchanged at `703,657` raw / `99,742` gzip bytes.
- Vite warnings: `51 -> 24`; locale mixed-import warnings: `27 -> 0`.

The committed JavaScript raw ceiling and gzip reference are therefore
`2,399,468` and `698,817` bytes. Future regressions cannot consume the recovered
headroom without failing or surfacing in the budget report.

## Risks and limits

- Literal eager/negative lists duplicate the namespace-to-path mapping, but the
  contract test fails on additions, removals, wildcard broadening, or overlap.
- Vite manifest key generation is a build-tool contract. The required dynamic
  entry gate intentionally fails if an upgrade changes that shape or folds a
  `zh-TW` module back into the static graph.
- Shared terms remain eager for all locales, so this change removes only the nine
  `zh-TW` JSON modules and does not claim that every Traditional Chinese byte is
  deferred.
- The startup byte reduction is the production measurement recorded above; it
  is not an estimate and should be remeasured whenever the bundle boundary changes.
