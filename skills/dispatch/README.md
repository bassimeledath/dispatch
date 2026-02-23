# /dispatch

**Stop juggling terminals.** One command dispatches work to background AI agents — Claude, GPT, Gemini — while you keep coding.

<p align="center">
  <img src="assets/architecture.svg" alt="dispatch architecture: you run /dispatch, it plans the task, fans out to parallel workers (Claude, GPT, Gemini), and reports results back" width="700" />
</p>

```
/dispatch "do a security review of this project"
```

The dispatcher plans the task, spawns background workers, and reports back. You never leave your session.

---

## How it works

1. You run `/dispatch "task description"`
2. A checklist plan is created at `.dispatch/tasks/<id>/plan.md`
3. A background worker picks it up and checks off items as it goes
4. You get results when it's done — or ask for status anytime

Workers can use **any model** you have access to. Mix Claude for deep reasoning, GPT for broad tasks, Gemini for speed — all from one interface.

## Setup

On first run, `/dispatch` auto-detects your CLIs (`claude`, `agent`, `codex`), discovers available models, and generates `~/.dispatch/config.yaml`. No manual config needed.

## Configuration

Three sections in `~/.dispatch/config.yaml`:

**Backends** — CLI commands for each provider:
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

**Models** — one line each, mapped to a backend:
```yaml
models:
  opus:            { backend: claude }
  sonnet:          { backend: claude }
  gpt-5.3-codex:  { backend: codex }
  gemini-3.1-pro:  { backend: cursor }
```

**Aliases** — named shortcuts with optional role prompts:
```yaml
aliases:
  security-reviewer:
    model: opus
    prompt: >
      You are a security-focused reviewer. Prioritize OWASP Top 10.
```

See [`references/config-example.yaml`](references/config-example.yaml) for the full example.

## Adding models

Reference any model by name — if it's not in your config, `/dispatch` auto-discovers and adds it:

```
/dispatch "use gemini-3.1-pro to review the API layer"
```

Or add manually: `/dispatch "add gpt-5.3 to my config"`

## Worker IPC

Workers can ask clarification questions **without exiting**. When a worker hits a blocker, it surfaces the question to you. After you answer, the worker picks up where it left off with full context preserved. If you're away, it saves context and marks the item `[?]` for later.

## Plan markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending |
| `[x]`  | Done |
| `[?]`  | Blocked — waiting for your answer |
| `[!]`  | Error |

## Host compatibility

Works in **Claude Code** and **Cursor**. The worker can be any CLI that accepts a prompt — Claude Code, Cursor CLI, Codex CLI, or anything you define in config.

## Cleanup

Delete `.dispatch/` to clean up task files.
