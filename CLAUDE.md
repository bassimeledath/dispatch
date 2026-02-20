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
  |- Reads ~/.dispatch/config.yaml (or auto-detects available CLIs)
  |- Creates plan file (.dispatch/tasks/<id>/plan.md) with checklist
  |- Spawns background worker using configured agent command
  |- Worker checks off items in plan.md as it completes them
  |- Dispatcher reads plan.md to track progress (on status request or task-notification)
  |- Handles blocked ([?]) and error ([!]) states
  |- Reports results to user
```

## Architecture

- `skills/dispatch/SKILL.md` - The core skill. Teaches the dispatcher session how to plan, dispatch, monitor, and report. Follows the Agent Skills standard for `npx skills add` compatibility.
- `skills/dispatch/references/config-example.yaml` - Example config users copy to `~/.dispatch/config.yaml`.
- `.dispatch/tasks/<task-id>/plan.md` - Checklist-based plan file. The worker updates it in place, checking off items as they complete. Single source of truth for task progress.
- `.dispatch/tasks/<task-id>/output.md` - Output artifact produced by the worker (findings, summaries, etc.).

## Config System

Workers are configured via `~/.dispatch/config.yaml`:

```yaml
default: cursor  # Agent used when none specified

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

- **Named agents**: Define agents by name; reference them naturally in prompts (e.g., "have harvey review...").
- **Auto-detection fallback**: If no config exists, `/dispatch` runs `which cursor` / `which claude` and uses the first available CLI.

## Key Patterns

- **Checklist-as-state**: The plan file IS the progress tracker. `[x]` = done, `[ ]` = pending, `[?]` = blocked, `[!]` = error. The dispatcher reads it to report progress without needing signal files or polling.
- **Configurable workers**: Any CLI that accepts a prompt as an argument can be a worker. Define it in `~/.dispatch/config.yaml`.
- **Fresh context per subtask**: Each subtask gets its own worker instance with a clean prompt.
- **Non-blocking dispatch**: The dispatcher dispatches and immediately returns control to the user. Progress arrives via `<task-notification>` events or manual status checks.
- **No rigid schema**: The dispatcher decides dynamically how to decompose work.

## `.dispatch/` Directory Structure

```
.dispatch/
  tasks/
    <task-id>/
      plan.md      # Checklist updated by worker as it progresses
      output.md    # Final output artifact (report, summary, etc.)
```

The `.dispatch/` directory is ephemeral. Delete it to clean up.

## Local Development

The symlink `.claude/skills/dispatch` → `skills/dispatch/` makes the skill available as `/dispatch` when developing in this repo.

## CI / Automation

- **Auto docs update** (`.github/workflows/update-docs.yml`): On every merge to `main`, a GitHub Action diffs the merge commit, passes it to Claude, and opens a PR with any needed updates to README.md and/or CLAUDE.md. Uses `[docs-bot]` in the commit message to prevent infinite loops. Requires `ANTHROPIC_API_KEY` repo secret.

## Repo

GitHub: `bassimeledath/dispatch`
