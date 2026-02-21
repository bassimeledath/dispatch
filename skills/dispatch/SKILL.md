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

## Step 2: Spawn the Worker

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

3. Spawn the worker as a background task by running the wrapper script.

   **In Claude Code:** Use Bash with `run_in_background: true`:
   ```bash
   bash /tmp/worker--<task-id>.sh
   ```
   This gives the user a readable label in the status bar (e.g., `worker--security-review.sh`) instead of the raw agent command.

   **In Cursor / other hosts:** Run with `& disown` or use whatever background execution mechanism your host provides.

### Worker Prompt Template

Write this to the temp file, replacing `{task-id}` with the actual task ID:

~~~
You have a plan file at .dispatch/tasks/{task-id}/plan.md containing a checklist.
Work through it top to bottom. For each item:

1. Do the work described.
2. Update the plan file: change `- [ ]` to `- [x]` for that item.
3. Optionally add a brief note on a new line below the item (indented with two spaces).
4. Move to the next item.

If you hit a blocker — something ambiguous, a missing dependency, a question only
a human can answer — update the item to `- [?]` and add a line explaining the blocker.
Then STOP. Do not continue past a blocked item.

If you encounter an error you cannot resolve, update the item to `- [!]` with an
error description, then STOP.

When all items are checked, your work is done.
~~~

### Task IDs

Short, descriptive, kebab-case: `security-review`, `add-auth`, `fix-login-bug`.

## Step 3: Report and Return Control

After dispatching, tell the user:
- The task ID
- The background task ID (from Bash)
- Which agent was used
- A brief summary of the plan (the checklist items)
- Then **stop and wait**

## Checking Progress

Progress is visible by reading the plan file. You can check it:

**A. When a `<task-notification>` arrives** (Claude Code: worker finished or was killed):
```bash
cat .dispatch/tasks/<task-id>/plan.md
```
Read the plan, report which items are done/blocked/failed, and share any output.

If all items are complete, end your report with:
`Feedback? Run /dispatch-feedback "your thoughts"`

**B. When the user asks** ("status", "check", "how's it going?"):
```bash
cat .dispatch/tasks/<task-id>/plan.md
```
Report the current state of each checklist item.

**C. To check if the worker process is still alive:**
- **Claude Code:** Use `TaskOutput(task_id=<background-task-id>, block=false, timeout=3000)`.
- **Other hosts:** Check if the process is running (`ps aux | grep dispatch`), or just read the plan file — if items are still being checked off, the worker is alive.

### Reading the Plan File

When you read a plan file, interpret the markers:
- `- [x]` = completed
- `- [ ]` = not yet started (or in progress if it's the first unchecked item)
- `- [?]` = blocked — look for the explanation line below it, surface it to the user
- `- [!]` = error — look for the error description, report it

## Handling Blocked Items

When a plan file shows `- [?]`:

1. Read the blocker explanation from the line below the item.
2. Surface the question to the user.
3. Wait for the user's answer.
4. Spawn a NEW worker with instructions:
   - Read the plan file
   - The answer to the blocked question is: "<user's answer>"
   - Continue from the blocked item onward

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

```
User: /dispatch "do a security review of this project"

Dispatcher: [reads ~/.dispatch/config.yaml — default agent: cursor]
Dispatcher: [writes .dispatch/tasks/security-review/plan.md]:
  # Security Review
  - [ ] Scan for hardcoded secrets, API keys, and credentials in source files
  - [ ] Review authentication and authorization logic for weaknesses
  - [ ] Check dependencies for known vulnerabilities
  - [ ] Audit input handling for injection risks (SQL, XSS, command injection)
  - [ ] Write findings report to .dispatch/tasks/security-review/output.md

Dispatcher: [writes /tmp/worker--security-review.sh, spawns bg_a1b2c3]
Dispatcher: Dispatched `security-review` (bg_a1b2c3) using cursor. Plan:
  1. Scan for hardcoded secrets
  2. Review auth logic
  3. Check dependencies
  4. Audit injection risks
  5. Write findings report
What else?

User: how's it going?

Dispatcher: [reads plan.md]
Dispatcher: security-review progress:
  [x] Scan for hardcoded secrets — found 1 API key in config.ts
  [x] Review auth logic — no issues
  [ ] Check dependencies
  [ ] Audit injection risks
  [ ] Write findings report
Worker is on step 3 of 5.

User: thanks
[<task-notification> for bg_a1b2c3 arrives]

Dispatcher: [reads plan.md — all items checked]
Dispatcher: `security-review` complete. Reading findings...
[reads .dispatch/tasks/security-review/output.md]
Dispatcher: Found 2 issues:
  1. Hardcoded API key in config.ts:14
  2. No rate limiting on /api/login endpoint
Full report at .dispatch/tasks/security-review/output.md
Feedback? Run `/dispatch-feedback "your thoughts"`
```

**The key behavior: plan, dispatch, track progress via checklist, never block.**
