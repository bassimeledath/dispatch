# Manager

A parallel coding delegation system. Manager dispatches tasks to background AI workers, tracks their progress, and surfaces events — all without blocking your terminal.

## Prerequisites

- **Node.js 18+**
- **git 2.15+** (worktree support for s1/s2 tasks)
- **Claude CLI** ([Claude Code](https://docs.anthropic.com/en/docs/claude-code))
- **gh CLI** (for PR creation on s1/s2 tasks)

## Installation

```bash
npm install -g manager-cli
```

## Quickstart

```bash
# Dispatch a task to a background worker
manager dispatch "add input validation to the signup form"

# Check status of all tasks
manager status

# Read and clear pending events (JSON)
manager events
```

## Commands

| Command | Description |
|---------|-------------|
| `manager dispatch <description>` | Dispatch a task to a background worker. |
| `manager status` | Show all tasks and their current status. |
| `manager questions` | List tasks currently waiting for user input. |
| `manager answer <id> <text>` | Answer a worker's question to unblock it. |
| `manager log <id>` | Stream the worker log for a task. |
| `manager cancel <id>` | Cancel a running task. |
| `manager events` | Read and clear pending events as a JSON array. |
| `manager config [action] [key] [value]` | Get or set config values (`list`, `get <key>`, `set <key> <value>`). |

## Flags (dispatch)

| Flag | Description |
|------|-------------|
| `--tier <tier>` | Worker tier: `quick`, `s1`, or `s2` (default: `s1`) |
| `--model <model>` | Override the implementer model for this task |
| `--engine <engine>` | Override the engine: `claude` or `cursor` |

## Worker Tiers

| Tier | Description |
|------|-------------|
| `quick` | Fast in-place edit. Commits staged changes directly to the current branch. Only one quick task runs at a time. |
| `s1` | Full implementation in a git worktree. Pushes a branch and opens a PR. |
| `s2` | Like s1 but adds a reviewer pass (up to 2 retries) before creating the PR. |

## Events System

Workers emit events to `.manager/events.jsonl` as they run. Use `manager events` to read and clear the queue:

```bash
manager events
# outputs a JSON array, e.g.:
# [
#   {
#     "type": "complete",
#     "taskId": "a1b2c3d4",
#     "description": "add input validation to the signup form",
#     "detail": "https://github.com/owner/repo/pull/42",
#     "timestamp": "2026-02-18T12:00:00.000Z"
#   }
# ]
```

Event types:

| Type | When emitted | `detail` field |
|------|--------------|----------------|
| `complete` | Task finished successfully | PR URL (if created), otherwise empty |
| `failed` | Task encountered an error | Error message |
| `question` | Worker is blocked waiting for input | The question text |

Events are consumed and cleared atomically — each call to `manager events` returns only new events since the last call. This makes it suitable for polling from scripts or Claude Code hooks.

## Configuration

Config is stored in `~/.manager/config.json`. Use `manager config` to manage it:

```bash
manager config list
manager config get models.quick
manager config set models.quick claude-sonnet-4-6
manager config set engine cursor
```

### Default Models

| Tier | Default model |
|------|---------------|
| `quick` | `claude-sonnet-4-6` |
| `s1` | `claude-sonnet-4-6` |
| `s2` implementer | `claude-sonnet-4-6` |
| `s2` reviewer | `claude-opus-4-6` |

### Preferences

Create `~/.manager/prefs.md` to inject personal preferences into every worker prompt:

```markdown
- Always use TypeScript strict mode
- Prefer named exports over default exports
- Write tests for new public functions
```

## `.manager/` Directory Structure

```
.manager/
  state.json            # Task registry (all tasks and their status)
  events.jsonl          # Pending events queue (consumed by `manager events`)
  tasks/
    <task-id>/
      log.txt           # Full worker log including engine output
```

## How It Works

1. **`manager dispatch`** creates a task entry in `.manager/state.json`, spawns a detached background worker process, and returns immediately. The terminal is not blocked.

2. **Workers** run in the background:
   - `quick` tasks run in the project directory, commit staged changes, and exit.
   - `s1` and `s2` tasks create a git worktree on a `manager/task-<id>` branch, implement the task, run a lint fix pass, commit, **push the branch**, and open a PR via `gh pr create`.

3. **Events** are written to `.manager/events.jsonl` at key milestones (task complete, task failed, question asked). `manager events` reads and clears the file atomically.

4. **Questions**: If a worker needs clarification, it writes a question to state and emits a `question` event. Use `manager questions` to see pending questions and `manager answer <id> <text>` to unblock the worker.

## Commit Format

Workers commit with the format:

```
manager(<task-id>): <description truncated to 72 chars>
```

## License

MIT
