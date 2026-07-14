# SplitAI Cinematic Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require SplitAI to use the built-in cinematic skill for storyboard image generation without changing its storyboard workflow or media tools.

**Architecture:** Extend the existing role-scoped Skill allowlist at the policy/resolver boundary, then append a narrowly scoped SplitAI runtime instruction through `CustomSubagent`. Keep storyboard generation and persistence behavior untouched.

**Tech Stack:** Rust (`void-core`), embedded Markdown Skill, Cargo unit tests.

---

### Task 1: Add SplitAI fixed Skill isolation

**Files:**
- Modify: `src/crates/core/src/agentic/tools/implementations/skills/policy.rs`
- Modify: `src/crates/core/src/agentic/tools/implementations/skills/resolver.rs`

- [ ] Add `SPLIT_AI_SKILL_ALLOWLIST` containing only `cinematic-style-repair` and return it for the case-insensitive `SplitAI` role.
- [ ] Extend resolver tests to prove only the built-in cinematic Skill is enabled for SplitAI and AssetAI remains unchanged.
- [ ] Run `cargo test -p void-core agentic::tools::implementations::skills` and expect all tests to pass.

### Task 2: Require cinematic style before storyboard image generation

**Files:**
- Modify: `src/crates/core/src/agentic/agents/definitions/custom/subagent.rs`

- [ ] Add a SplitAI-only runtime policy requiring `cinematic-style-repair` before every storyboard/keyframe `GenerateImage` call while preserving the existing artifact coordinates and ChangeRequest behavior.
- [ ] Add a prompt test and retain the existing media-tool test for `GenerateImage`, `GetMediaTaskStatus`, and `UploadMediaImage`.
- [ ] Run `cargo test -p void-core agentic::agents::definitions::custom::subagent` and expect all tests to pass.

### Task 3: Verify and commit

**Files:**
- Verify only the four files named in this plan plus this spec and plan.

- [ ] Run `cargo check -p void-core` and expect exit code 0.
- [ ] Run `git diff --check` and inspect `git diff --stat` for unrelated changes.
- [ ] Commit the implementation with a focused short-drama message.

