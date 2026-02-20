# Getting Started with /dispatch

`/dispatch` is a skill for Claude Code (and compatible tools) that decomposes large coding tasks into subtasks, dispatches them to background AI worker agents, and tracks progress via checklist-based plan files.

## What it does

1. **Decomposes** — Breaks your task into a checklist plan at `.dispatch/tasks/<task-id>/plan.md`
2. **Dispatches** — Spawns a background worker agent to execute the subtasks
3. **Tracks** — Updates the plan as it progresses (`[x]` done, `[ ]` pending, `[?]` blocked, `[!]` error)

You get control back immediately. Ask "status" anytime to check progress, or review the completion report when the task finishes.

---

## Configuring agents via /dispatch

You can configure worker agents using natural language. `/dispatch` reads and edits `~/.dispatch/config.yaml` directly — no special commands needed.

**Examples:**

- "add a gpt-5 agent to my dispatch config"
- "add gemini-2.5-pro to dispatch using cursor agent"
- "switch my default agent to claude"
- "add a fast model called speedy that uses composer-1.5 via cursor"

**Resulting config:**

```yaml
default: cursor

agents:
  cursor:
    command: >
      agent -p --force --workspace "$(pwd)"
  claude:
    command: >
      env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDECODE
      claude -p --dangerously-skip-permissions
  harvey:
    command: >
      agent -p --force --model gpt-5 --workspace "$(pwd)"
  speedy:
    command: >
      agent -p --force --model composer-1.5 --workspace "$(pwd)"
```

No config is required for the happy path — `/dispatch` auto-detects available CLIs (Cursor `agent`, Claude Code).

---

## Dispatching tasks

Use `/dispatch` with a prompt describing what you want done:

**Security & reviews:**

- `/dispatch do a security review of this project`
- `/dispatch have reviewer check my latest changes`

**Refactoring:**

- `/dispatch refactor the auth module to use JWT`

**Testing:**

- `/dispatch write unit tests for the API endpoints`

**Documentation:**

- `/dispatch update the README to reflect recent changes`

**Quick fixes:**

- `/dispatch fix a typo in README.md`

**Named agents:** If you defined a named agent (e.g. `harvey`) in your config, use it in prompts:

- `/dispatch have harvey review the auth module`

---

## Next steps

- See [skills/dispatch/README.md](../skills/dispatch/README.md) for detailed usage and configuration.
