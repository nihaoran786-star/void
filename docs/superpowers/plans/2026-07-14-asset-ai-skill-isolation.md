# AssetAI Skill Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AssetAI exactly two production image skills, enforce the character-board/cinematic workflow in its runtime prompt, and preserve all existing short-drama media tools.

**Architecture:** Package copied skill material as Void built-ins so AssetAI can use it in every workspace. Add a role-scoped fixed allowlist at the skill resolver boundary, then append AssetAI-specific workflow instructions through the existing `CustomSubagent` runtime policy instead of placing business logic in the UI.

**Tech Stack:** Rust (`void-core`), embedded Markdown skills, YAML agent metadata, Cargo unit tests.

---

## File map

- Create `src/crates/core/builtin_skills/short-drama-character-board/SKILL.md`: normalized character identity board workflow derived from the copied text.
- Create `src/crates/core/builtin_skills/short-drama-character-board/agents/openai.yaml`: user-facing skill metadata.
- Create `src/crates/core/builtin_skills/cinematic-style-repair/**`: exact copy of the supplied cinematic skill and references.
- Modify `src/crates/core/src/agentic/tools/implementations/skills/catalog.rs`: register both embedded skills and a short-drama group.
- Modify `src/crates/core/src/agentic/tools/implementations/skills/policy.rs`: declare AssetAI's fixed allowlist.
- Modify `src/crates/core/src/agentic/tools/implementations/skills/resolver.rs`: make fixed role policy the authoritative availability decision.
- Modify `src/crates/core/src/agentic/tools/implementations/skills/types.rs`: expose fixed-allowlist state reasons.
- Modify `src/crates/core/src/agentic/agents/definitions/custom/subagent.rs`: append AssetAI extraction and image workflow instructions while preserving runtime tools.

### Task 1: Package the supplied skills without mutating their sources

**Files:**
- Create: `src/crates/core/builtin_skills/short-drama-character-board/SKILL.md`
- Create: `src/crates/core/builtin_skills/short-drama-character-board/agents/openai.yaml`
- Create: `src/crates/core/builtin_skills/cinematic-style-repair/SKILL.md`
- Create: `src/crates/core/builtin_skills/cinematic-style-repair/agents/openai.yaml`
- Create: `src/crates/core/builtin_skills/cinematic-style-repair/references/*.md`
- Modify: `src/crates/core/src/agentic/tools/implementations/skills/catalog.rs`

- [ ] **Step 1: Record source hashes and copy the cinematic skill**

Run `Get-FileHash` recursively for both sources, copy the cinematic directory to the built-in destination, then rerun source hashes. Expected: source hashes are identical before and after; destination contains `SKILL.md`, `agents/openai.yaml`, and every reference file.

- [ ] **Step 2: Create the normalized character-board skill**

Use this frontmatter and workflow contract:

```markdown
---
name: short-drama-character-board
description: "Create a 16:9 cinematic character identity board for AI short-drama production. Use for character reference images that must lock face, hair, costume, body proportions, silhouettes, poses, expressions, and episode-specific visual state across future image and video generation."
---

# 短剧角色身份板

读取角色身份、集数、服装状态和参考图。输出提示词必须锁定 16:9 艺术性身份板、非对称留白、大型全身主视图、独立辅助视角、轮廓/表情/细节研究和简洁角色 ID 块。禁止人物图像重叠、面部裁切、肢体隐藏、姿势合并、水印和场景化背景。
```

Preserve the supplied text's detailed layout and identity rules in imperative form below this contract.

- [ ] **Step 3: Register both embedded skills**

Add `ShortDramaCharacterBoard` and `CinematicStyleRepair` variants to `BuiltinSkillId`, add `ShortDrama` to `BuiltinSkillGroup`, and add catalog specs mapping the two directory names to that group.

- [ ] **Step 4: Run the embedded catalog test**

Run: `cargo test -p void-core catalog_covers_all_embedded_builtin_skills`

Expected: PASS; no embedded skill is missing from the catalog.

- [ ] **Step 5: Validate both skills**

Run the Skill Creator `quick_validate.py` against both directories.

Expected: both validations report success; YAML contains no unsupported frontmatter fields.

### Task 2: Enforce AssetAI's fixed Skill allowlist

**Files:**
- Modify: `src/crates/core/src/agentic/tools/implementations/skills/policy.rs`
- Modify: `src/crates/core/src/agentic/tools/implementations/skills/resolver.rs`
- Modify: `src/crates/core/src/agentic/tools/implementations/skills/types.rs`

- [ ] **Step 1: Write the failing resolver test**

Add a test that builds three skills named `short-drama-character-board`, `cinematic-style-repair`, and `using-superpowers`, resolves each for `AssetAI`, and asserts:

```rust
assert!(character_board.effective_enabled);
assert!(cinematic.effective_enabled);
assert!(!superpowers.effective_enabled);
```

Also assert a custom skill remains enabled for `ScriptAI` so the new restriction is role-scoped.

- [ ] **Step 2: Run the test to verify RED**

Run: `cargo test -p void-core asset_ai_uses_only_fixed_short_drama_image_skills`

Expected: FAIL because custom user skills are currently enabled by default.

- [ ] **Step 3: Add the fixed policy interface**

Add this public policy shape:

```rust
pub const ASSET_AI_SKILL_ALLOWLIST: &[&str] = &[
    "short-drama-character-board",
    "cinematic-style-repair",
];

pub fn fixed_skill_allowlist_for_agent(agent_type: &str) -> Option<&'static [&'static str]> {
    agent_type.eq_ignore_ascii_case("AssetAI").then_some(ASSET_AI_SKILL_ALLOWLIST)
}
```

- [ ] **Step 4: Make the resolver authoritative**

At the start of `resolve_skill_state_for_mode`, when a fixed allowlist exists, match by `skill.dir_name`. Return enabled for listed skills and disabled for all others before applying generic built-in, user, or project defaults. Add serialized reasons `EnabledByAgentAllowlist` and `DisabledByAgentAllowlist`.

- [ ] **Step 5: Run focused resolver and registry tests**

Run:

```text
cargo test -p void-core asset_ai_uses_only_fixed_short_drama_image_skills
cargo test -p void-core custom_user_skills_are_enabled_by_default
cargo test -p void-core builtin_defaults_follow_mode_policies
```

Expected: all PASS; non-AssetAI behavior remains unchanged.

### Task 3: Enforce AssetAI's extraction and image-generation prompt contract

**Files:**
- Modify: `src/crates/core/src/agentic/agents/definitions/custom/subagent.rs`

- [ ] **Step 1: Write a failing prompt contract test**

Create an `AssetAI` custom subagent with `ShortDramaProject`, build its prompt, and assert it contains all observable requirements:

```rust
assert!(prompt.contains("short-drama-character-board"));
assert!(prompt.contains("cinematic-style-repair"));
assert!(prompt.contains("角色、场景、道具、服装"));
assert!(prompt.contains("episode-specific"));
assert!(prompt.contains("patch.mediaReference"));
```

- [ ] **Step 2: Run the test to verify RED**

Run: `cargo test -p void-core asset_ai_prompt_requires_fixed_asset_workflow`

Expected: FAIL because the prompt does not yet name either fixed Skill.

- [ ] **Step 3: Add an AssetAI-only runtime policy section**

Append instructions only when `self.name.eq_ignore_ascii_case("AssetAI")`:

```text
Extract characters, locations, props, costumes, and episode-specific states before generating images.
For a character identity board, invoke short-drama-character-board and cinematic-style-repair before GenerateImage.
For scene, character-shot, prop, or other asset images, invoke cinematic-style-repair before GenerateImage.
Create/update one asset anchor per output and attach successful output through patch.mediaReference.
```

Retain the existing `ShortDramaProject` and media execution policy unchanged.

- [ ] **Step 4: Verify the prompt and media tools**

Run:

```text
cargo test -p void-core asset_ai_prompt_requires_fixed_asset_workflow
cargo test -p void-core short_drama_stage_agents_receive_stage_scoped_media_runtime_tools
```

Expected: both PASS; AssetAI still has `GenerateImage`, `GetMediaTaskStatus`, and `UploadMediaImage`.

### Task 4: Verify integration and source preservation

**Files:**
- Test only; no additional source files.

- [ ] **Step 1: Run the complete skills and custom subagent test slices**

Run: `cargo test -p void-core agentic::tools::implementations::skills`

Run: `cargo test -p void-core agentic::agents::definitions::custom::subagent`

Expected: all tests PASS.

- [ ] **Step 2: Run core type/build verification**

Run: `cargo check -p void-core`

Expected: exit code 0 with no new error.

- [ ] **Step 3: Recompute external source hashes**

Compare against Task 1's recorded hashes.

Expected: every supplied source file has the same hash; nothing was deleted or moved.

- [ ] **Step 4: Review the final diff**

Confirm no UI file, unrelated user change, or external source path appears in the staged diff. Confirm the diff is understandable as one AssetAI Skill isolation change.

- [ ] **Step 5: Commit the implementation**

Stage only the AssetAI policy, tests, and copied built-in skills. Commit with:

```text
feat(short-drama): isolate AssetAI production skills
```
