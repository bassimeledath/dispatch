# Manager

A CLI for delegating coding tasks to background AI workers. Manager classifies tasks by complexity, spawns isolated workers in git worktrees, runs a post-implementation lint step, and opens PRs — all without blocking your terminal.

## Prerequisites

- **Node.js 18+**
- **git 2.15+** (worktree support)
- **Claude CLI** ([Claude Code](https://docs.anthropic.com/en/docs/claude-code)) or **Cursor CLI**
- **gh CLI** (for automatic PR creation)

## Installation

```bash
npm install -g manager-cli
```

## Quickstart

```bash
# Dispatch a quick fix (runs in-place, no branch)
manager dispatch "fix the typo in the header" --tier quick

# Dispatch a focused feature (worktree + PR)
manager dispatch "add input validation to the signup form" --tier s1

# Dispatch a complex change (worktree + Opus reviewer + PR)
manager dispatch "refactor the auth module to use JWT" --tier s2

# Check on running tasks
manager status

# Stream a worker's log
manager log <id>
```

## Commands

| Command | Description |
|---------|-------------|
| `manager dispatch <description>` | Dispatch a task to a background worker. |
| `manager status` | Show all tasks and their current status. |
| `manager questions` | List tasks waiting for user input. |
| `manager answer <id> <text>` | Answer a worker's question to unblock it. |
| `manager log <id>` | Stream the worker log for a task. |
| `manager cancel <id>` | Cancel a running task and clean up. |
| `manager config list` | Show current model and engine configuration. |
| `manager config get <key>` | Get a specific config value. |
| `manager config set <key> <value>` | Set a config value. |

## Dispatch Flags

| Flag | Description |
|------|-------------|
| `--tier <tier>` | Worker tier: `quick`, `s1`, or `s2` (default: `s1`) |
| `--model <model>` | Override the implementer model for this task |
| `--engine <engine>` | Override the engine for this task (`claude`, `cursor`) |

## Tiers

| Tier | Description | Engine Behavior |
|------|-------------|-----------------|
| `quick` | Single-line fix, typo, trivial copy change. Runs in-place (no branch). | Commits directly to current branch. |
| `s1` | Bug fix, simple feature, focused refactor. | Runs in a git worktree, post-implementation lint/fix step, opens a PR. |
| `s2` | Multi-file feature, architectural change. | Same as s1, plus an Opus reviewer pass with up to 2 revision cycles before the PR. |

## Configuration

Manager stores config globally at `~/.manager/config.json`. Use `manager config` to read and update it.

```bash
manager config list                                    # Show all settings
manager config get models.s1                          # Get a specific value
manager config set models.s1 claude-sonnet-4-6        # Set the S1 model
manager config set models.reviewer claude-opus-4-6    # Set the reviewer model
manager config set engine cursor                       # Switch to Cursor engine
```

**Config keys:**

| Key | Default | Description |
|-----|---------|-------------|
| `engine` | `claude` | Default engine (`claude` or `cursor`) |
| `models.quick` | `claude-haiku-4-5` | Model for quick tasks |
| `models.s1` | `claude-sonnet-4-6` | Model for s1 tasks |
| `models.s2` | `claude-sonnet-4-6` | Implementer model for s2 tasks |
| `models.reviewer` | `claude-opus-4-6` | Reviewer model for s2 tasks |

Per-dispatch overrides take precedence over global config:

```bash
manager dispatch "add auth" --tier s1 --model claude-opus-4-6 --engine cursor
```

## User Preferences

Workers read `~/.manager/prefs.md` on each run. Edit this file to set standing preferences:

```
Prefer small, focused PRs.
Always add tests for new features.
Use TypeScript strict mode.
```

## How It Works

1. **`manager dispatch`** assigns a task ID, creates a state entry, and spawns a detached worker process. Your terminal is free immediately.

2. **Workers** run in the background:
   - **quick**: Runs the AI in the current directory. Stages and commits any changes.
   - **s1**: Creates a git worktree on a `manager/task-<id>` branch. Runs the AI, then runs a lint/typecheck step — if lint fails, the AI is re-invoked to fix the errors. Commits, then opens a PR.
   - **s2**: Same as s1, but after implementation adds a reviewer pass (using the reviewer model). If the reviewer requests revisions, the implementer is re-invoked with feedback (up to 2 cycles). Then opens a PR.

3. **Questions**: If a worker is genuinely blocked, it emits a JSON question marker. The worker pauses and waits. Use `manager questions` to see pending questions and `manager answer <id> "<text>"` to unblock.

4. **Commit format**: `manager(<task-id>): <description>`

## `.manager/` Directory Structure

```
.manager/
  state.json           # Task state (all tasks, statuses, metadata)
  tasks/
    <task-id>/
      log.txt          # Full worker output log
```

## /manager Slash Command (Claude Code)

Install the `/manager` skill in Claude Code to activate Manager Mode. In this mode, Claude acts as a delegation layer — classifying your requests and dispatching them to workers rather than implementing anything directly.

To install, copy `templates/manager.md` from this repo to your Claude Code commands directory:

```bash
cp templates/manager.md ~/.claude/commands/manager.md
```

Then use `/manager` in any Claude Code session to activate delegation mode.

## License

MIT
