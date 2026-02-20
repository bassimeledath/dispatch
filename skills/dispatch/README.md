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

## Configuration

Create `~/.dispatch/config.yaml` to define worker agents:

```yaml
default: cursor

agents:
  cursor:
    command: >
      cursor agent --model gpt-5.3-codex-xhigh-fast
      --print --trust --yolo --workspace "$(pwd)"

  claude:
    command: >
      env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE
      claude -p --dangerously-skip-permissions
```

See [`references/config-example.yaml`](references/config-example.yaml) for a full example.

**No config needed for the happy path** — if you skip config, `/dispatch` auto-detects `cursor` or `claude` CLI on your PATH.

## Named agents

Define custom agents in your config, then reference them by name:

```yaml
agents:
  harvey:
    command: >
      cursor agent --model gpt-5.3-codex-xhigh-fast
      --print --trust --yolo --workspace "$(pwd)"
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

The **worker** agent (the one doing the actual work) can be any CLI that accepts a prompt — cursor agent, claude -p, or anything you define in config.

## Cleanup

Delete `.dispatch/` to clean up task files.
