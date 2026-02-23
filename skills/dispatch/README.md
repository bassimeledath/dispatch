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

## First-run setup

On first use, `/dispatch` runs an interactive setup:

1. **Detects CLIs** — checks for `agent` (Cursor CLI) and `claude` (Claude Code) on your PATH
2. **Discovers models** — runs `agent models` (if Cursor is available) to list all models you have access to
3. **Asks your preference** — presents notable models and asks which should be your default
4. **Generates config** — writes `~/.dispatch/config.yaml` with all detected models

No manual config needed — just run `/dispatch` and follow the prompts.

## Configuration

The config file at `~/.dispatch/config.yaml` has three sections:

### Backends

CLI commands for each provider. The `--model` flag is appended automatically.

```yaml
backends:
  claude:
    command: >
      env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE
      claude -p --dangerously-skip-permissions

  cursor:
    command: >
      agent -p --force --workspace "$(pwd)"
```

### Models

Each model maps to a backend. Adding a model is one line:

```yaml
models:
  opus:            { backend: claude }
  sonnet:          { backend: claude }
  gpt-5.3-codex:  { backend: cursor }
  gemini-3.1-pro:  { backend: cursor }
```

When dispatching with `gpt-5.3-codex`, the command becomes:
`agent -p --force --workspace "$(pwd)" --model gpt-5.3-codex`

### Aliases

Named shortcuts with optional prompt additions. Reference by name in dispatch commands:

```yaml
aliases:
  security-reviewer:
    model: opus
    prompt: >
      You are a security-focused reviewer. Prioritize OWASP Top 10
      vulnerabilities, auth flaws, and injection risks.

  quick:
    model: sonnet
```

```
/dispatch "have security-reviewer audit the auth module"
```

The alias prompt is prepended to the worker's task prompt, and the underlying model is used.

See [`references/config-example.yaml`](references/config-example.yaml) for the full example.

## Adding models

If you reference a model not in your config, `/dispatch` automatically checks if it's available:

- Runs `agent models` to verify availability
- Adds it to your config with the correct backend
- Dispatches with it immediately

You can also add models manually:

```
/dispatch "add gpt-5.3 to my config"
```

Or edit `~/.dispatch/config.yaml` directly.

## Asking questions

Workers can ask clarification questions **without exiting**. When a worker hits a blocker, it writes a question to an IPC file. A sentinel process detects it and notifies the dispatcher, which surfaces the question to you. After you answer, the worker picks up where it left off — with full context preserved.

If the answer doesn't arrive within ~3 minutes (e.g., you stepped away), the worker falls back to the original behavior: saves its context, marks the item `[?]`, and exits. When you return and answer, a new worker spawns with the saved context.

This is automatic — you don't need to configure anything.

## Plan file markers

Workers update the plan file as they progress:

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending |
| `[x]`  | Done    |
| `[?]`  | Blocked — worker timed out waiting for an answer and exited |
| `[!]`  | Error   |

## Checking progress

Ask anytime: "status", "how's it going?", or just check `.dispatch/tasks/<task-id>/plan.md` directly.

## Host compatibility

Works with **Claude Code** and **Cursor** as the host (the tool you run `/dispatch` in). Claude Code gets richer integration (background task notifications, status bar labels). Cursor works via standard background process execution.

The **worker** agent (the one doing the actual work) can be any CLI that accepts a prompt — Cursor CLI, Claude Code, or anything you define in config.

## Backward compatibility

Old configs using the `agents:` format still work. The dispatcher treats each agent entry as an alias with an inline command. To upgrade, run:

```
/dispatch "migrate my config"
```

## Cleanup

Delete `.dispatch/` to clean up task files.
