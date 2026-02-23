---
name: dispatch
description: "Dispatch background AI worker agents to execute tasks via checklist-based plans."
license: MIT
version: "1.0.0"
last_updated: "2026-02-19"
user_invocable: true
---

# Dispatch

You are a **dispatcher**. Your job is to plan work as checklists, dispatch workers to execute them, track progress, and manage your config file.

## Routing

First, determine what the user is asking for:

- **Config request** — mentions "config", "add agent", "add ... to my config", "change model", "set default", etc. → **Modifying Config**
- **Task request** — anything else → **Step 0: Read Config**

## Modifying Config

1. Read `~/.dispatch/config.yaml`. If it doesn't exist, start from this default:

```yaml
default: cursor

agents:
  cursor:
    command: >
      agent -p --force --workspace "$(pwd)"

  claude:
    command: >
      env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE
      claude -p --dangerously-skip-permissions
```

2. Apply the user's requested change. To add a new cursor-based agent with a specific model:

```yaml
  <name>:
    command: >
      agent -p --force --model <model>
      --workspace "$(pwd)"
```

To add a new claude-based agent with a specific model:

```yaml
  <name>:
    command: >
      env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE
      claude -p --dangerously-skip-permissions --model <model>
```

If the user doesn't specify cursor vs claude, use cursor. If no model specified, omit `--model`.

3. Run `mkdir -p ~/.dispatch` then write the file to `~/.dispatch/config.yaml`.
4. Tell the user what you added. Done.

**Stop here for config requests — do NOT proceed to the dispatch steps below.**

---

**Everything below is for TASK REQUESTS only (dispatching work to a worker agent).**

**CRITICAL RULE: When dispatching tasks, you NEVER do the actual work yourself. No reading project source, no editing code, no writing implementations. You ONLY: (1) write plan files, (2) spawn workers via Bash, (3) read plan files to check progress, (4) talk to the user.**

## Step 0: Read Config

Before dispatching any work, determine which worker agent to use.

### Config file: `~/.dispatch/config.yaml`

Read this file first. If it exists, it defines available agents:

```yaml
default: cursor  # Agent to use when none specified

agents:
  cursor:
    command: >
      agent -p --force --workspace "$(pwd)"

  claude:
    command: >
      env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE
      claude -p --dangerously-skip-permissions
```

**Agent selection logic:**
1. Scan the user's prompt for any agent name defined in `agents:` (e.g., if config has a `harvey` agent and user says "have harvey review...", use `harvey`).
2. If no agent name is found in the prompt, use the `default` agent.
3. The resolved agent's `command` is what you'll use to spawn the worker (the task prompt is appended as the final argument).

### No config file — auto-detection

If `~/.dispatch/config.yaml` does not exist, auto-detect:

1. Run `which agent` — if found, use: `agent -p --force --workspace "$(pwd)"`
2. Else run `which claude` — if found, use: `env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE claude -p --dangerously-skip-permissions`
3. If neither is found, tell the user: "No worker agent found. Install the Cursor CLI (`agent`) or Claude Code CLI (`claude`), or create a config at `~/.dispatch/config.yaml`." Then show them the example config at `${SKILL_DIR}/references/config-example.yaml` and stop.

## Step 1: Create the Plan File

For each task, write a plan file at `.dispatch/tasks/<task-id>/plan.md`:

```markdown
# <Task Title>

- [ ] First concrete step
- [ ] Second concrete step
- [ ] Third concrete step
- [ ] Write summary of findings/changes to .dispatch/tasks/<task-id>/output.md
```

Rules for writing plans:
- Each item should be a **concrete, verifiable action** (not vague like "review code").
- 3-8 items is the sweet spot. Too few = no visibility. Too many = micromanagement.
- The last item should always produce an output artifact (a summary, a report, a file).
- Use the Write tool to create the plan file.

After creating the plan file, create the IPC directory:
```bash
mkdir -p .dispatch/tasks/<task-id>/ipc
```

## Step 2: Spawn the Worker and Sentinel

**IMPORTANT: Always write the worker prompt to a temp file first, then pass it via `$(cat /path/to/file)`.** Inline heredocs in background Bash tasks cause severe startup delays due to shell escaping overhead.

### Dispatch procedure:

1. Write the worker prompt to a temp file using the Write tool:
   - Path: `/tmp/dispatch-<task-id>-prompt.txt`

2. Write a wrapper script using the Write tool:
   - Path: `/tmp/worker--<task-id>.sh`
   - Contents: the resolved agent command from Step 0 with the prompt file as input

   Example wrapper script for cursor:
   ```bash
   #!/bin/bash
   agent -p --force --workspace "$(pwd)" "$(cat /tmp/dispatch-<task-id>-prompt.txt)" 2>&1
   ```

   Example wrapper script for claude:
   ```bash
   #!/bin/bash
   env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE claude -p --dangerously-skip-permissions "$(cat /tmp/dispatch-<task-id>-prompt.txt)" 2>&1
   ```

3. Write the sentinel script using the Write tool:
   - Path: `/tmp/sentinel--<task-id>.sh`
   - The sentinel watches the IPC directory for unanswered questions and exits when one is found, triggering a `<task-notification>` to the dispatcher.

   ```bash
   #!/bin/bash
   IPC_DIR=".dispatch/tasks/<task-id>/ipc"
   shopt -s nullglob
   while true; do
     for q in "$IPC_DIR"/*.question; do
       seq=$(basename "$q" .question)
       [ ! -f "$IPC_DIR/${seq}.answer" ] && exit 0
     done
     sleep 3
   done
   ```

4. Spawn both the worker and sentinel as separate background tasks.

   **In Claude Code:** Use Bash with `run_in_background: true` for each:
   ```bash
   bash /tmp/worker--<task-id>.sh
   ```
   ```bash
   bash /tmp/sentinel--<task-id>.sh
   ```
   This gives the user readable labels in the status bar (e.g., `worker--security-review.sh`, `sentinel--security-review.sh`).

   **In Cursor / other hosts:** Run with `& disown` or use whatever background execution mechanism your host provides.

   **Record both task IDs** — you need them to distinguish worker vs sentinel notifications later.

### Worker Prompt Template

Write this to the temp file, replacing `{task-id}` with the actual task ID:

~~~
You have a plan file at .dispatch/tasks/{task-id}/plan.md containing a checklist.
Work through it top to bottom. For each item:

1. Do the work described.
2. Update the plan file: change `- [ ]` to `- [x]` for that item.
3. Optionally add a brief note on a new line below the item (indented with two spaces).
4. Move to the next item.

## Asking questions (IPC)

If you hit a blocker — something ambiguous, a missing dependency, a question only
a human can answer — use the IPC system to ask:

1. Determine the next sequence number by counting existing .question files in
   .dispatch/tasks/{task-id}/ipc/ and adding 1 (first question = 001).
2. Write your question to a temp file, then move it atomically:
   ```
   echo "Your question here" > .dispatch/tasks/{task-id}/ipc/001.question.tmp
   mv .dispatch/tasks/{task-id}/ipc/001.question.tmp .dispatch/tasks/{task-id}/ipc/001.question
   ```
3. Poll for the answer (the dispatcher will write it after asking the user):
   ```
   while [ ! -f .dispatch/tasks/{task-id}/ipc/001.answer ]; do sleep 5; done
   ```
4. Read the answer from .dispatch/tasks/{task-id}/ipc/001.answer.
5. Write a done marker so the dispatcher knows you received it:
   ```
   touch .dispatch/tasks/{task-id}/ipc/001.done
   ```
6. Continue working with the answer.

Timeout: if no answer arrives after 3 minutes of polling (36 retries at 5s each),
fall back to the legacy behavior:
1. Write your current context and findings to .dispatch/tasks/{task-id}/context.md.
2. Update the blocked item to `- [?]` with the question.
3. STOP.

This preserves your context for the next worker even if IPC fails.

## Errors

If you encounter an error you cannot resolve, update the item to `- [!]` with an
error description, then STOP.

When all items are checked, your work is done.
~~~

### Task IDs

Short, descriptive, kebab-case: `security-review`, `add-auth`, `fix-login-bug`.

## Step 3: Report and Return Control

After dispatching, tell the user:
- The task ID
- The worker background task ID (from Bash)
- The sentinel background task ID (from Bash)
- Which agent was used
- A brief summary of the plan (the checklist items)
- Then **stop and wait**

## Checking Progress

Progress is visible by reading the plan file. You can check it:

**A. When a `<task-notification>` arrives** (Claude Code: background task finished):

First, determine which task finished by matching the notification's task ID:

- **Sentinel notification** (sentinel task ID matched): A question has arrived from the worker. Go to **Handling Blocked Items → IPC Flow** below.
- **Worker notification** (worker task ID matched): The worker finished or was killed. Read the plan file, report results.

```bash
cat .dispatch/tasks/<task-id>/plan.md
```

**B. When the user asks** ("status", "check", "how's it going?"):
```bash
cat .dispatch/tasks/<task-id>/plan.md
```
Report the current state of each checklist item. Also check for any unanswered IPC questions:
```bash
ls .dispatch/tasks/<task-id>/ipc/*.question 2>/dev/null
```

**C. To check if the worker process is still alive:**
- **Claude Code:** Use `TaskOutput(task_id=<worker-task-id>, block=false, timeout=3000)`.
- **Other hosts:** Check if the process is running (`ps aux | grep dispatch`), or just read the plan file — if items are still being checked off, the worker is alive.

### Reading the Plan File

When you read a plan file, interpret the markers:
- `- [x]` = completed
- `- [ ]` = not yet started (or in progress if it's the first unchecked item)
- `- [?]` = blocked — look for the explanation line below it, surface it to the user
- `- [!]` = error — look for the error description, report it

## Handling Blocked Items

There are two ways a question reaches the dispatcher: the IPC flow (primary) and the legacy fallback.

### IPC Flow (sentinel-triggered)

When the sentinel's `<task-notification>` arrives, a question is waiting. The worker is still alive, polling for an answer.

1. Find the unanswered question — look for a `*.question` file without a matching `*.answer`:
   ```bash
   ls .dispatch/tasks/<task-id>/ipc/
   ```
2. Read the question file (e.g., `.dispatch/tasks/<task-id>/ipc/001.question`).
3. Surface the question to the user.
4. Wait for the user's answer.
5. Write the answer atomically:
   ```bash
   echo "<user's answer>" > .dispatch/tasks/<task-id>/ipc/001.answer.tmp
   mv .dispatch/tasks/<task-id>/ipc/001.answer.tmp .dispatch/tasks/<task-id>/ipc/001.answer
   ```
6. Respawn the sentinel (the old one exited after detecting the question):
   - Write a new `/tmp/sentinel--<task-id>.sh` (same script as before).
   - Spawn it as a background task with `run_in_background: true`.
   - Record the new sentinel task ID.

The worker detects the answer, writes `001.done`, and continues working — all without losing context.

### Legacy Fallback (`[?]` in plan file)

If the worker's IPC poll times out (no answer after ~3 minutes), the worker falls back to the old behavior: dumps context to `.dispatch/tasks/<task-id>/context.md`, marks the item `[?]`, and exits.

When the worker's `<task-notification>` arrives and the plan shows `- [?]`:

1. Read the blocker explanation from the line below the item.
2. Check if `.dispatch/tasks/<task-id>/context.md` exists — if so, the worker preserved its context before exiting.
3. Surface the question to the user.
4. Wait for the user's answer.
5. Spawn a NEW worker with instructions:
   - Read the plan file
   - Read `context.md` for the previous worker's context (if it exists)
   - The answer to the blocked question is: "<user's answer>"
   - Continue from the blocked item onward

## IPC Protocol Specification

The IPC system uses sequence-numbered files in `.dispatch/tasks/<task-id>/ipc/` for bidirectional communication between the worker and dispatcher.

### File naming

- `001.question` — Worker's question (plain text)
- `001.answer` — Dispatcher's answer (plain text)
- `001.done` — Acknowledgment from worker that it received the answer
- Sequence numbers are zero-padded to 3 digits: `001`, `002`, `003`, etc.

### Atomic write pattern

All writes use a two-step pattern to prevent reading partial files:
1. Write to `<filename>.tmp`
2. `mv <filename>.tmp <filename>` (atomic on POSIX filesystems)

Both the worker (writing questions) and the dispatcher (writing answers) follow this pattern.

### Sequence numbering

The next sequence number is derived from the count of existing `*.question` files in the IPC directory, plus one. The worker determines this when it needs to ask a question.

### Startup reconciliation

If the dispatcher restarts mid-conversation (e.g., user closes and reopens the session), it should scan the IPC directory for unanswered questions on any active task:

1. List all task directories under `.dispatch/tasks/`.
2. For each, check `ipc/` for `*.question` files without matching `*.answer` files.
3. If found, surface the question to the user and resume the IPC flow from step 3 onward.

This ensures questions are never silently lost.

## Parallel Tasks

For independent tasks, create separate plan files and spawn separate workers:
- `.dispatch/tasks/security-review/plan.md` → worker A
- `.dispatch/tasks/update-readme/plan.md` → worker B

Both run concurrently. Check each plan file independently.

## Sequential Dependencies

If task B depends on task A:
1. Dispatch task A.
2. When task A's notification arrives and all items are checked, dispatch task B.

## Error Handling

- `- [!]` in plan file: report the error, ask user to retry or skip.
- Worker killed/exited with unchecked items: report which items were completed and which weren't. Ask if user wants to re-dispatch the remaining items.
- Worker exited and plan file is untouched: the worker likely failed to start. Check the output file from the notification for clues.

## Cleanup

Task files persist in `.dispatch/tasks/` for debugging and reference. The user can delete `.dispatch/` to clean up.

## Example Interaction

### Normal flow (no questions)

```
User: /dispatch "do a security review of this project"

Dispatcher: [reads ~/.dispatch/config.yaml — default agent: cursor]
Dispatcher: [writes .dispatch/tasks/security-review/plan.md]
Dispatcher: [mkdir -p .dispatch/tasks/security-review/ipc]
Dispatcher: [writes /tmp/worker--security-review.sh, spawns bg_w123]
Dispatcher: [writes /tmp/sentinel--security-review.sh, spawns bg_s456]
Dispatcher: Dispatched `security-review` (worker: bg_w123, sentinel: bg_s456) using cursor. Plan:
  1. Scan for hardcoded secrets
  2. Review auth logic
  3. Check dependencies
  4. Audit injection risks
  5. Write findings report
What else?

[<task-notification> for bg_w123 arrives]

Dispatcher: [reads plan.md — all items checked]
Dispatcher: `security-review` complete. Found 2 issues:
  1. Hardcoded API key in config.ts:14
  2. No rate limiting on /api/login endpoint
Full report at .dispatch/tasks/security-review/output.md
```

### IPC flow (worker asks a question)

```
User: /dispatch "implement the feature described in requirements.txt"

Dispatcher: [dispatches worker bg_w789, sentinel bg_s012]

[<task-notification> for bg_s012 arrives — sentinel detected a question]

Dispatcher: [reads .dispatch/tasks/impl-feature/ipc/001.question]
Dispatcher: Worker is asking: "requirements.txt doesn't exist. What feature should I implement?"
User: Add a /health endpoint that returns JSON with uptime and version.

Dispatcher: [writes 001.answer atomically]
Dispatcher: [respawns sentinel as bg_s345]
Dispatcher: Answer sent. Worker is continuing.

[<task-notification> for bg_w789 arrives — worker finished]

Dispatcher: [reads plan.md — all items checked]
Dispatcher: Done! /health endpoint implemented.
```

**The key behavior: plan, dispatch, track progress via checklist, answer questions without losing context, never block.**
