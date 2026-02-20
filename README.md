# dispatch

A skill for Claude Code (and compatible tools) that dispatches background AI worker agents to execute tasks via checklist-based plans.

## Install

```bash
npx skills add bassimeledath/dispatch
```

Or manually copy `skills/dispatch/` into your project's `.claude/skills/` directory.

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
