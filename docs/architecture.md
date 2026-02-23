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
  |- Creates IPC directory (.dispatch/tasks/<id>/ipc/)
  |- Resolves model → backend → command (appends --model flag for cursor/codex backends)
  |- Writes wrapper script to /tmp/worker--<id>.sh, spawns it as background task
  |- Writes monitor script to /tmp/monitor--<id>.sh, spawns it as background task
  |- Worker checks off items in plan.md as it completes them
  |- When all items are checked, worker writes ipc/.done
  |- Monitor detects .done and exits cleanly
  |- If worker hits a blocker:
  |    |- Worker writes question to ipc/001.question (atomic write)
  |    |- Monitor detects question, exits → triggers <task-notification>
  |    |- Dispatcher reads question, asks user, writes ipc/001.answer
  |    |- Dispatcher respawns monitor
  |    |- Worker detects answer, writes 001.done, continues working
  |    |- Timeout fallback: worker dumps context.md, marks [?], exits
  |- Dispatcher reads plan.md to track progress (on status request or task-notification)
  |- Handles blocked ([?]) and error ([!]) states
  |- Reports results to user
```

## Components

- `skills/dispatch/SKILL.md` — The core skill. Teaches the dispatcher session how to plan, dispatch, monitor, and report. Follows the Agent Skills standard for `npx skills add` compatibility.
- `skills/dispatch/references/config-example.yaml` — Example config users copy to `~/.dispatch/config.yaml`.
- `.dispatch/tasks/<task-id>/plan.md` — Checklist-based plan file. The worker updates it in place, checking off items as they complete. Single source of truth for task progress.
- `.dispatch/tasks/<task-id>/output.md` — Output artifact produced by the worker (findings, summaries, etc.).
- `.dispatch/tasks/<task-id>/ipc/` — IPC directory for bidirectional worker-dispatcher communication. Contains sequence-numbered question/answer/done files.
- `.dispatch/tasks/<task-id>/context.md` — Context dump written by the worker when IPC times out, preserving state for the next worker.

## `.dispatch/` Directory Structure

```
.dispatch/
  tasks/
    <task-id>/
      plan.md      # Checklist updated by worker as it progresses
      output.md    # Final output artifact (report, summary, etc.)
      context.md   # Worker context dump on IPC timeout (optional)
      ipc/         # Bidirectional IPC files
        001.question  # Worker's question (plain text)
        001.answer    # Dispatcher's answer (plain text)
        001.done      # Worker's acknowledgment
        .done         # Completion marker written by worker when all tasks finish
```

The `.dispatch/` directory is ephemeral. Delete it to clean up.

See also: [Config System](config.md) | [IPC Protocol](ipc-protocol.md) | [Development](development.md)

## Key Design Patterns

- **Checklist-as-state**: The plan file IS the progress tracker. `[x]` = done, `[ ]` = pending, `[?]` = blocked, `[!]` = error. The dispatcher reads it to report progress without needing signal files or polling.
- **Host vs worker distinction**: The host session (where the user types `/dispatch`) must be Claude Code — it is the only environment that runs the dispatcher. Worker CLIs (Claude Code, Cursor, Codex, or any CLI that accepts a prompt) execute subtasks in the background.
- **Fresh context per subtask**: Each subtask gets its own worker instance with a clean prompt.
- **Non-blocking dispatch**: The dispatcher dispatches and immediately returns control to the user. Progress arrives via `<task-notification>` events or manual status checks.
- **No rigid schema**: The dispatcher decides dynamically how to decompose work.
- **Explicit routing**: Before acting, the dispatcher classifies the prompt as either a config request (mentions "config", "add agent", "change model", etc.) or a task request. Config requests are handled inline without spawning a worker; task requests proceed through the normal plan-and-dispatch flow.
- **Readable status bar via wrapper script**: Workers are launched through a `/tmp/worker--<task-id>.sh` wrapper so Claude Code's status bar shows a human-readable label instead of the raw agent command.
- **Proactive recovery**: When a worker fails to start, the dispatcher checks CLI availability and offers alternatives from the config, updating the default if needed.
