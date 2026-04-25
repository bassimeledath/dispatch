# Architecture

Dispatch is a skill (`/dispatch`) for Claude Code that decomposes large coding tasks into subtasks, dispatches them to background AI worker agents, and tracks progress via checklist-based plan files.

## How It Works

```
User types: /dispatch "build auth system"
         |
         v
Claude Code (dispatcher session)
  |
  |- Routes: config request? → edit ~/.dispatch/config.yaml inline, done
  |          task request?   → continue below
  |
  |- Reads ~/.dispatch/config.yaml (or runs first-run setup)
  |- Creates plan file (.dispatch/tasks/<id>/plan.md) with checklist
  |- Resolves model → maps to Agent tool model parameter (opus/sonnet/haiku)
  |- Spawns worker via Agent tool with run_in_background: true
  |- Worker checks off items in plan.md as it completes them
  |- When all items are checked, worker writes ipc/.done
  |- If worker hits a blocker:
  |    |- Worker writes question to ipc/001.question (atomic write)
  |    |- Worker writes context.md, marks item [?], exits
  |    |- Agent tool notification fires → dispatcher reads question
  |    |- Dispatcher asks user, writes ipc/001.answer
  |    |- Dispatcher spawns new worker with context.md + answer
  |- Dispatcher reads plan.md to track progress (on notification or status request)
  |- Handles blocked ([?]) and error ([!]) states
  |- Reports results to user
```

## Components

- `skills/dispatch/SKILL.md` — The core skill. Teaches the dispatcher session how to plan, dispatch, and report. Follows the Agent Skills standard for `npx skills add` compatibility.
- `skills/dispatch/references/config-example.yaml` — Example config users copy to `~/.dispatch/config.yaml`.
- `.dispatch/tasks/<task-id>/plan.md` — Checklist-based plan file. The worker updates it in place, checking off items as they complete. Single source of truth for task progress.
- `.dispatch/tasks/<task-id>/output.md` — Output artifact produced by the worker (findings, summaries, etc.).
- `.dispatch/tasks/<task-id>/ipc/` — IPC directory for worker-dispatcher communication. Contains sequence-numbered question/answer files.
- `.dispatch/tasks/<task-id>/context.md` — Context dump written by the worker when it needs to ask a question, preserving state for the next worker.

## `.dispatch/` Directory Structure

```
.dispatch/
  tasks/
    <task-id>/
      plan.md      # Checklist updated by worker as it progresses
      output.md    # Final output artifact (report, summary, etc.)
      context.md   # Worker context dump when asking a question
      ipc/         # IPC files
        001.question  # Worker's question (plain text)
        001.answer    # Dispatcher's answer (plain text)
        .done         # Completion marker written by worker when all tasks finish
```

The `.dispatch/` directory is ephemeral. Delete it to clean up.

See also: [Config System](config.md) | [IPC Protocol](ipc-protocol.md) | [Development](development.md)

## Key Design Patterns

- **Checklist-as-state**: The plan file IS the progress tracker. `[x]` = done, `[ ]` = pending, `[?]` = blocked, `[!]` = error. The dispatcher reads it to report progress without needing signal files or polling.
- **Agent tool workers**: All workers are spawned via the Agent tool with `run_in_background: true`. This provides native integration with Claude Code's notification system — no wrapper scripts or monitor processes needed.
- **Fresh context per subtask**: Each subtask gets its own worker instance with a clean prompt.
- **Question = exit**: When a worker needs user input, it writes the question to an IPC file, dumps its context to `context.md`, and exits. The dispatcher gets notified, asks the user, and spawns a new worker with the answer.
- **Non-blocking dispatch**: The dispatcher dispatches and immediately returns control to the user. Progress arrives via `<task-notification>` events or manual status checks.
- **No rigid schema**: The dispatcher decides dynamically how to decompose work.
- **Explicit routing**: Before acting, the dispatcher classifies the prompt as either a config request (mentions "config", "add agent", "change model", etc.) or a task request. Config requests are handled inline without spawning a worker; task requests proceed through the normal plan-and-dispatch flow.
- **Proactive recovery**: When a worker fails to start, the dispatcher checks the error and offers alternative models from the config.
