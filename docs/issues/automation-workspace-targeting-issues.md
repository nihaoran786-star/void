# Automation Workspace Targeting Issues

## Risk isolation

- Keep phase A inside existing capabilities: existing workspaces, existing code/cowork sessions, existing Cron jobs.
- Do not change Rust CronService schema, jobs persistence format, subagent lifecycle, or FlowChat session state machine.
- Keep automation scene as the UI host only. Target resolution should live in automation view-model/helpers, not in large page components.
- Treat "create new session and bind" as a later gated slice. First make existing workspace/session selection reliable.
- "Run now" should use an explicit adapter method and existing backend capability. It must not fake execution by creating a one-shot job.

## Issue 1: Add explicit automation target model

## What to build

Define the automation target draft used by the create task flow. It should represent the user choice as workspace, session mode, session target, prompt, and schedule without inferring these values from a single Agent dropdown.

## Acceptance criteria

- [x] Automation has an explicit target draft shape: workspace id/path, session mode (`code` or `cowork`), optional session id, prompt, and schedule.
- [x] Existing `CronJob -> AutomationTask` mapping remains compatible with current jobs.
- [x] Recovered sessions are not presented as a recommended default target.
- [x] Unit tests cover target filtering for code/cowork sessions, recovered fallback sessions, child sessions, assistant sessions, and transient sessions.

## Blocked by

None - can start immediately.

## Issue 2: Let users choose the workspace before choosing a session

## What to build

Update the create automation task flow so the first target choice is the workspace. The dialog should default to the current workspace but allow selecting any existing workspace that the app already knows about.

## Acceptance criteria

- [x] Create task dialog shows a workspace selector before session selection.
- [x] Selector defaults to the current workspace when available.
- [x] Changing workspace updates available code/cowork sessions for that workspace.
- [x] If no workspace is available, the dialog shows a clear empty state and disables creation.
- [x] No workspace selection logic is duplicated in sidebar/header components.

## Blocked by

- Issue 1.

## Issue 3: Split execution mode from concrete session

## What to build

Replace the current "Agent" dropdown with two concepts: execution mode and target session. Execution mode should be `编码会话` or `办公会话`; target session should list existing sessions matching the selected workspace and mode.

## Acceptance criteria

- [x] Create task dialog has a visible execution mode selector for code/cowork.
- [x] Target session selector only shows sessions matching the selected workspace and mode.
- [x] `Recovered Session` is hidden by default or clearly marked as a fallback/recovered session and not auto-selected when another valid session exists.
- [x] The create request still sends the selected session id to `CronAPI.createJob`.
- [x] Tests cover mode-specific session filtering and label generation.

## Blocked by

- Issue 1.
- Issue 2.

## Issue 4: Add run-now adapter and UI action

## What to build

Expose the existing backend "run scheduled job now" capability to the frontend and add a safe UI action on automation task detail/cards.

## Acceptance criteria

- [x] Desktop Tauri API exposes a run-now command for a job id using existing CronService behavior.
- [x] Frontend `CronAPI` has `runJobNow(jobId)` with clear error wrapping.
- [x] Automation task detail or card includes `立即执行`.
- [x] Clicking `立即执行` refreshes task state after success or failure.
- [x] Errors are shown through existing notification patterns.
- [x] Tests cover the frontend adapter contract and UI action wiring where practical.

## Blocked by

None - can start immediately, but should be merged after Issue 1 if the UI location depends on the new target model.

## Issue 5: Support "open or create workspace" as a gated follow-up

## What to build

Add a safe path for users who have no suitable workspace. This should first support opening/selecting an existing workspace through established workspace APIs. Creating a brand-new workspace should be a separate explicit action if the existing app already supports it.

## Acceptance criteria

- [x] Empty workspace state offers a clear action to open/select a workspace.
- [x] The action reuses existing workspace APIs and does not create ad hoc filesystem behavior.
- [x] New workspace creation is only included if an existing workspace creation API is already available.
- [x] The create task dialog resumes with the selected workspace after the user chooses one.

## Blocked by

- Issue 2.

## Issue 6: Document AI-created automation task behavior

## What to build

Clarify how chat-created automation tasks should work in phase A. The existing Cron tool can create jobs for the current session; the product should document that this creates tasks bound to the active session/workspace and visible in the automation center.

## Acceptance criteria

- [x] Document that AI-created automation tasks bind to the current session/workspace in phase A.
- [x] Document that choosing arbitrary workspace/session from chat is out of scope unless the tool already receives an explicit session id.
- [x] Add a manual QA checklist: ask AI to create a scheduled job, verify it appears in automation center, verify run-now if available.
- [x] No new tool schema or model prompt changes are required in this slice.

## Blocked by

- Issue 1.
