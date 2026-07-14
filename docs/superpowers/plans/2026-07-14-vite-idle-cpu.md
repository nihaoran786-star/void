# Vite Idle CPU Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate Vite's high idle CPU usage on Windows while preserving the existing development server behavior.

**Architecture:** Keep the Vite server and HMR architecture unchanged. Remove only the forced 100ms polling override so Vite uses native filesystem events, and protect that contract with one focused configuration test.

**Tech Stack:** Vite 7, TypeScript, Vitest, pnpm.

---

### Task 1: Protect the native-watcher contract

**Files:**
- Create: `src/web-ui/vite.config.test.ts`
- Modify: `src/web-ui/vite.config.ts`

- [ ] Add a Vitest test that resolves the real development config and asserts `server.watch.usePolling` is not `true`.
- [ ] Run `pnpm --dir src/web-ui exec vitest run vite.config.test.ts` and confirm it fails because the current value is `true`.
- [ ] Remove the `server.watch` polling block from `vite.config.ts`; do not change ports, HMR, plugins, aliases, build, or dependency optimization.
- [ ] Rerun the focused test and confirm it passes.

### Task 2: Verify behavior and measured performance

**Files:**
- Verify: `src/web-ui/vite.config.ts`
- Verify: `src/web-ui/vite.config.test.ts`

- [ ] Run `pnpm run type-check:web` and require exit code 0.
- [ ] Start Vite on an unused diagnostic port, request the page over HTTP, sample the Vite and esbuild process CPU for 8 seconds, then stop only the diagnostic process tree.
- [ ] Require HTTP success and idle CPU near 0%; inspect `git diff --check` and commit only the config, test, spec, and plan.

