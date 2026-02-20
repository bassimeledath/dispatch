# dispatch

A skill for Claude Code (and compatible tools) that dispatches background AI worker agents to execute tasks via checklist-based plans.

## Install

**Project-level** (shared with your team via version control):

```bash
npx skills add bassimeledath/dispatch
```

**User-level** (available in all your projects):

```bash
npx skills add bassimeledath/dispatch -g
```

Or manually copy `skills/dispatch/` into `.claude/skills/` (project) or `~/.claude/skills/` (global).

## Prerequisites

An AI CLI backend — at least one of:
- [Cursor CLI](https://docs.cursor.com/) (`agent`) — recommended
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude -p`)

## Quick start

```
/dispatch "add user authentication with JWT"
```

The dispatcher creates a plan, spawns a background worker, and returns control immediately. Ask "status" anytime to check progress.

## Configuration (optional)

Create `~/.dispatch/config.yaml` to define worker agents:

```yaml
default: cursor

agents:
  cursor:
    command: >
      agent -p --force --workspace "$(pwd)"
```

No config is needed for the happy path — `/dispatch` auto-detects available CLIs.

See [skills/dispatch/README.md](skills/dispatch/README.md) for detailed usage and configuration.

## License

MIT
