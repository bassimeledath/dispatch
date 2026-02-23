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

This also installs the companion `/dispatch-feedback` skill for logging feedback on dispatched tasks.

## Prerequisites

An AI CLI backend — at least one of:
- [Cursor CLI](https://docs.cursor.com/) (`agent`) — recommended
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude -p`)
- [Codex CLI](https://github.com/openai/codex) (`codex`) — for OpenAI models

## Quick start

```
/dispatch "fix a typo in README.md"
```

The dispatcher creates a checklist plan, spawns a background worker, and returns control immediately. Ask "status" anytime to check worker progress, then review the completion report when the task finishes.

After a task completes, you can log feedback with:

```
/dispatch-feedback "your thoughts"
```

This appends a record to `.dispatch/feedback/events.jsonl` and optionally opens a GitHub issue.

## Configuration

On first use, `/dispatch` runs an interactive setup — detects available CLIs, discovers models, and generates `~/.dispatch/config.yaml` automatically. No manual config needed.

The config uses a model-centric schema:

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
  opus:   { backend: claude }
  sonnet: { backend: claude }
  gpt-5.3-codex: { backend: codex }

aliases:
  security-reviewer:
    model: opus
    prompt: >
      You are a security-focused reviewer.
```

Old configs using the `agents:` format remain backward compatible.

See [skills/dispatch/README.md](skills/dispatch/README.md) for detailed usage and configuration.

## License

MIT
