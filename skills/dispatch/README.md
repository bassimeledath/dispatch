# /dispatch

Dispatch background AI worker agents to execute tasks via checklist-based plans.

## What it does

`/dispatch` decomposes a task into a checklist plan, spawns a background AI worker to execute it, and tracks progress — all without blocking your session.

```
/dispatch "do a security review of this project"
```

The dispatcher:
1. Creates a checklist plan at `.dispatch/tasks/<task-id>/plan.md`
2. Spawns a background worker to execute it
3. Returns control immediately
4. Reports progress when you ask or when the worker finishes

## Configuration (optional)

Create `~/.dispatch/config.yaml` to define worker agents. No config is needed for the happy path — `/dispatch` auto-detects `agent` (Cursor CLI) or `claude` on your PATH.

**Cursor CLI worker:**

```yaml
default: cursor

agents:
  cursor:
    command: >
      agent -p --force --workspace "$(pwd)"
```

**Claude Code worker:**

```yaml
default: claude

agents:
  claude:
    command: >
      env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE
      claude -p --dangerously-skip-permissions
```

**Both (pick a default):**

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

See [`references/config-example.yaml`](references/config-example.yaml) for all available flags.

## Named agents

Define custom agents in your config, then reference them by name:

```yaml
agents:
  harvey:
    command: >
      agent -p --force --model gpt-5
      --workspace "$(pwd)"
```

```
/dispatch "have harvey review the auth module"
```

The dispatcher scans your prompt for agent names from the config and routes accordingly.

## Plan file markers

Workers update the plan file as they progress:

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending |
| `[x]`  | Done    |
| `[?]`  | Blocked — needs human input |
| `[!]`  | Error   |

## Checking progress

Ask anytime: "status", "how's it going?", or just check `.dispatch/tasks/<task-id>/plan.md` directly.

## Host compatibility

Works with **Claude Code** and **Cursor** as the host (the tool you run `/dispatch` in). Claude Code gets richer integration (background task notifications, status bar labels). Cursor works via standard background process execution.

The **worker** agent (the one doing the actual work) can be any CLI that accepts a prompt — Cursor CLI, Claude Code, or anything you define in config.

## Cleanup

Delete `.dispatch/` to clean up task files.
