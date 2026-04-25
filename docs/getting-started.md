# Getting Started with /dispatch

`/dispatch` is a skill for Claude Code that decomposes large coding tasks into subtasks, dispatches them to background AI worker agents, and tracks progress via checklist-based plan files.

## What it does

1. **Decomposes** — Breaks your task into a checklist plan at `.dispatch/tasks/<task-id>/plan.md`
2. **Dispatches** — Spawns a background worker agent via the Agent tool to execute the subtasks
3. **Tracks** — Updates the plan as it progresses (`[x]` done, `[ ]` pending, `[?]` blocked, `[!]` error)

You get control back immediately. Ask "status" anytime to check progress, or review the completion report when the task finishes.

---

## Configuring models via /dispatch

You can configure worker models using natural language. `/dispatch` reads and edits `~/.dispatch/config.yaml` directly — no special commands needed.

**Examples:**

- "switch my default to sonnet"
- "add opus-4.5-thinking to my config"
- "create a security-reviewer alias using opus"

**Resulting config:**

```yaml
default: opus

models:
  opus: {}
  sonnet: {}
  haiku: {}
  opus-4.5-thinking: {}

aliases:
  security-reviewer:
    model: opus
    prompt: >
      You are a security-focused reviewer. Prioritize OWASP Top 10
      vulnerabilities, auth flaws, and injection risks.
```

No config is required for the happy path — `/dispatch` generates it on first run.

---

## Dispatching tasks

Use `/dispatch` with a prompt describing what you want done:

**Security & reviews:**

- `/dispatch do a security review of this project`
- `/dispatch have security-reviewer check my latest changes`

**Refactoring:**

- `/dispatch refactor the auth module to use JWT`

**Testing:**

- `/dispatch write unit tests for the API endpoints`

**Documentation:**

- `/dispatch update the README to reflect recent changes`

**Quick fixes:**

- `/dispatch fix a typo in README.md`

**Named aliases:** If you defined an alias (e.g. `security-reviewer`) in your config, use it in prompts:

- `/dispatch have security-reviewer review the auth module`

---

## Next steps

- See [skills/dispatch/README.md](../skills/dispatch/README.md) for detailed usage and configuration.
