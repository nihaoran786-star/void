# Automation Phase A Behavior

## Scope

Phase A keeps automation inside the existing Cron job system.

- Manual creation chooses an opened workspace and an execution mode. The app creates a dedicated main session for the task and binds the Cron job to that session.
- Supported execution modes are code sessions and cowork sessions.
- Assistant workspaces, assistant sessions, subagents, transient sessions, hidden child sessions, and recovered sessions are not manual automation targets in this phase.
- Automation-created sessions use a minimal title marker, `自动化 · <任务名称>`, so they can be distinguished from normal chats without adding a new session metadata contract.

## AI-created automation tasks

When a user asks AI to create an automation task, the existing Cron tool creates the job for the active session and its bound workspace.

Phase A does not let chat-created automation tasks choose an arbitrary workspace or another session unless the tool already receives an explicit session id from the current runtime.

No Cron tool schema, model prompt, jobs persistence format, or CronService scheduler behavior changes are required for this phase.

## Run history and artifacts

Phase A can identify the session bound to each automation job, but it does not provide a complete run history or artifact archive inside the automation page.

A later phase should add a stable run record before exposing full artifacts. The minimum model should include:

- job id
- session id
- turn id
- status
- start and finish timestamps
- artifact references

Without that run record, the UI can only infer recent work from the bound session and Cron state. That is useful for navigation, but not enough for reliable artifact history.

## Manual QA

1. Open a project workspace.
2. Open Automation, create a task, choose the workspace, choose `编码会话` or `办公会话`, enter a prompt, and save.
3. Verify the task appears on the calendar/list.
4. Verify a new sidebar session appears with the `自动化 ·` title marker.
5. Open the task detail panel and click `立即执行`.
6. Verify the dedicated session receives the scheduled job turn.
7. Ask AI in a session to create a scheduled job.
8. Verify the job appears in Automation and is bound to the current session/workspace.
