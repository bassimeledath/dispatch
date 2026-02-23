# Dispatch - Development Guide

## Overview

Dispatch is a skill (`/dispatch`) for Claude Code and compatible tools that decomposes large coding tasks into subtasks, dispatches them to background AI worker agents, and tracks progress via checklist-based plan files.

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
  |- Writes sentinel script to /tmp/sentinel--<id>.sh, spawns it as background task
  |- Worker checks off items in plan.md as it completes them
  |- If worker hits a blocker:
  |    |- Worker writes question to ipc/001.question (atomic write)
  |    |- Sentinel detects question, exits → triggers <task-notification>
  |    |- Dispatcher reads question, asks user, writes ipc/001.answer
  |    |- Dispatcher respawns sentinel
  |    |- Worker detects answer, writes 001.done, continues working
  |    |- Timeout fallback: worker dumps context.md, marks [?], exits
  |- Dispatcher reads plan.md to track progress (on status request or task-notification)
  |- Handles blocked ([?]) and error ([!]) states
  |- Reports results to user
```

## Architecture

- `skills/dispatch/SKILL.md` - The core skill. Teaches the dispatcher session how to plan, dispatch, monitor, and report. Follows the Agent Skills standard for `npx skills add` compatibility.
- `skills/dispatch-feedback/SKILL.md` - Companion skill for logging freeform feedback on dispatched tasks and optionally opening a GitHub issue.
- `skills/dispatch/references/config-example.yaml` - Example config users copy to `~/.dispatch/config.yaml`.
- `.dispatch/tasks/<task-id>/plan.md` - Checklist-based plan file. The worker updates it in place, checking off items as they complete. Single source of truth for task progress.
- `.dispatch/tasks/<task-id>/output.md` - Output artifact produced by the worker (findings, summaries, etc.).
- `.dispatch/tasks/<task-id>/ipc/` - IPC directory for bidirectional worker-dispatcher communication. Contains sequence-numbered question/answer/done files.
- `.dispatch/tasks/<task-id>/context.md` - Context dump written by the worker when IPC times out, preserving state for the next worker.

## Config System

Workers are configured via `~/.dispatch/config.yaml`. The config uses a model-centric schema:

```yaml
default: opus  # Default model (by name or alias)

backends:
  claude:
    command: >
      env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE
      claude -p --dangerously-skip-permissions
  cursor:
    command: >
      agent -p --force --workspace "$(pwd)"
  codex:
    command: >
      codex exec --full-auto -C "$(pwd)"

models:
  opus:            { backend: claude }
  sonnet:          { backend: claude }
  haiku:           { backend: claude }
  gpt-5.3-codex:  { backend: codex }
  gemini-3.1-pro:  { backend: cursor }

aliases:
  security-reviewer:
    model: opus
    prompt: >
      You are a security-focused reviewer.
  quick:
    model: sonnet
```

### How commands are constructed

**Cursor backend** — append `--model`:
1. Look up model (e.g., `gemini-3.1-pro`) → `backend: cursor`
2. Look up backend → `agent -p --force --workspace "$(pwd)"`
3. Append `--model gemini-3.1-pro` → final command

**Claude backend** — do NOT append `--model`:
1. Look up model (e.g., `opus`, or a versioned ID like `sonnet-4.6`) → `backend: claude`
2. Use the backend command as-is. The Claude CLI manages its own model selection. Appending `--model` can cause access errors due to internal alias resolution.

**Codex backend** — append `--model`:
1. Look up model (e.g., `gpt-5.3-codex`) → `backend: codex`
2. Look up backend → `codex exec --full-auto -C "$(pwd)"`
3. Append `--model gpt-5.3-codex` → final command

> **Claude model detection:** Any model ID containing `opus`, `sonnet`, or `haiku` — including versioned variants (e.g., `sonnet-4.6`, `opus-4.5-thinking`) — is a Claude model and must use `backend: claude` when the Claude Code CLI is available. Never route Claude models through the cursor backend.

> **OpenAI model detection:** Any model ID containing `gpt`, `codex`, `o1`, `o3`, or `o4-mini` is an OpenAI model and must use `backend: codex` when the Codex CLI is available. Only fall back to `cursor` backend when Codex is not installed.

For aliases, the alias's `model` is resolved the same way, and any `prompt` addition is prepended to the worker prompt.

### Backward compatibility

Old `agents:` config format is still recognized. Each agent entry is treated as an alias with an inline command. The dispatcher suggests migration to the new format.

## Key Patterns

- **Checklist-as-state**: The plan file IS the progress tracker. `[x]` = done, `[ ]` = pending, `[?]` = blocked, `[!]` = error. The dispatcher reads it to report progress without needing signal files or polling.
- **Model-centric config**: Backends define CLI commands once; models map to backends. For the Cursor and Codex backends, `--model` is appended automatically. For the Claude backend, `--model` is omitted (the CLI manages its own model selection). Adding a model is one line.
- **First-run setup**: On first use (no config file), the dispatcher detects CLIs, discovers available models via `agent models`, presents options via AskUserQuestion, and generates the config. No manual YAML writing needed.
- **Smart model resolution**: If a user references a model not in config, the dispatcher probes availability (`agent models`), auto-adds it, and dispatches — no config editing needed.
- **Aliases with prompt additions**: Named shortcuts (e.g., `security-reviewer`) that resolve to a model and optionally prepend role-specific instructions to the worker prompt.
- **Host vs worker distinction**: The host session (where the user types `/dispatch`) must be Claude Code or Cursor — these are the only environments that run the dispatcher. Worker CLIs (Claude Code, Cursor, Codex, or any CLI that accepts a prompt) execute subtasks in the background. Codex and other non-host CLIs can only be workers, not hosts.
- **Fresh context per subtask**: Each subtask gets its own worker instance with a clean prompt.
- **Non-blocking dispatch**: The dispatcher dispatches and immediately returns control to the user. Progress arrives via `<task-notification>` events or manual status checks.
- **No rigid schema**: The dispatcher decides dynamically how to decompose work.
- **Explicit routing**: Before acting, the dispatcher classifies the prompt as either a config request (mentions "config", "add agent", "change model", etc.) or a task request. Config requests are handled inline without spawning a worker; task requests proceed through the normal plan-and-dispatch flow.
- **Natural language config editing**: Users can say "add gpt-5.3 to my config" or "create a security-reviewer alias" and the dispatcher reads, edits, and writes `~/.dispatch/config.yaml` directly — no special commands needed.
- **Readable status bar via wrapper script**: Workers are launched through a `/tmp/worker--<task-id>.sh` wrapper so Claude Code's status bar shows a human-readable label instead of the raw agent command.
- **Sentinel-based IPC**: A lightweight sentinel script polls the IPC directory for unanswered questions. When it finds one, it exits — triggering a `<task-notification>` that alerts the dispatcher. This lets workers ask questions without exiting, preserving their full in-memory context. Falls back to `[?]` + `context.md` on timeout.
- **Proactive recovery**: When a worker fails to start, the dispatcher checks CLI availability and offers alternatives from the config, updating the default if needed.

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
  feedback/
    events.jsonl   # Feedback log written by /dispatch-feedback
```

The `.dispatch/` directory is ephemeral. Delete it to clean up.

## Local Development

The symlinks `.claude/skills/dispatch` → `skills/dispatch/` and `.claude/skills/dispatch-feedback` → `skills/dispatch-feedback/` make the skills available as `/dispatch` and `/dispatch-feedback` when developing in this repo.

## CI / Automation

- **Auto docs update** (`.github/workflows/update-docs.yml`): On every merge to `main`, a GitHub Action diffs the merge commit, passes it to Claude, and opens a PR with any needed updates to README.md and/or CLAUDE.md. Uses `[docs-bot]` in the commit message to prevent infinite loops. Requires `ANTHROPIC_API_KEY` repo secret.

## Repo

GitHub: `bassimeledath/dispatch`
