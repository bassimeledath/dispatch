# <img src="skills/dispatch/assets/logo.svg" alt="Dispatch logo" width="36" style="vertical-align: middle;" /> /dispatch

**You don't need 6 terminals.** You need one session that delegates.

`/dispatch` turns your AI coding session into a command center. You describe work, it plans a checklist, fans out to background workers — Claude, GPT, Gemini — and tracks progress. You stay in one clean session. Workers do the heavy lifting in isolated contexts.

<p align="center">
  <img src="skills/dispatch/assets/before-after.svg" alt="Before: developer juggling 6 terminal tabs with separate AI agents, arrows crossing everywhere. After: one session delegates to a dispatcher that fans out to workers with a clean feedback loop." width="900" />
</p>

```
/dispatch "do a security review of this project"
```

---

## Why dispatch

### Your main session stays lean

The dispatcher **never does the actual work**. It plans, delegates, and tracks. The heavy reasoning — code review, refactoring, test writing — happens in isolated worker contexts. Your main session's context window is preserved for orchestration, not consumed by implementation details.

### Workers ask questions back

This is the part most agent orchestrators get wrong. When a `/dispatch` worker gets stuck, it doesn't silently fail or hallucinate. It **asks a clarifying question** — the dispatcher surfaces it to you, you answer, and the worker continues **without losing context**. No restart, no re-explaining, no lost work.

```
Worker is asking: "requirements.txt doesn't exist. What feature should I implement?"
> Add a /health endpoint that returns JSON with uptime and version.

Answer sent. Worker is continuing.
```

### Non-blocking — you never wait

The moment a worker is dispatched, your session is **immediately free**. Dispatch another task. Ask a question. Write code. The dispatcher handles multiple workers in parallel, reports results as they arrive, and surfaces questions only when they need your input. No polling, no tab-switching, no "is it done yet?"

### Any model, one interface

Mix models per task. Claude for deep reasoning, GPT for broad generation, Gemini for speed. Reference any model by name — if it's not in your config, `/dispatch` auto-discovers and adds it.

```
/dispatch "use gemini-3.1-pro to review the API layer"
```

---

> **Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as your host session.** Dispatch is a skill that runs _inside_ Claude Code — the host plans tasks and spawns workers. Other CLIs like [Cursor](https://docs.cursor.com/) and [Codex](https://github.com/openai/codex) work as **workers only** (background agents that execute subtasks).

## Install

```bash
npx skills add bassimeledath/dispatch -g     # user-level (all projects)
npx skills add bassimeledath/dispatch        # project-level (team-shared)
```

## How it works

1. You run `/dispatch "task description"`
2. A checklist plan is created at `.dispatch/tasks/<id>/plan.md`
3. A background worker picks it up and checks off items as it goes
4. If the worker has a question, it asks — you answer — it continues
5. You get results when it's done, or ask for status anytime

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
  codex:
    command: >
      codex exec --full-auto -C "$(pwd)"
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

## Prerequisites

**Host (required — at least one):**
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`)
- [Cursor](https://docs.cursor.com/) (`agent`)

**Workers (optional — for multi-model dispatch):**
- [Codex CLI](https://github.com/openai/codex) (`codex`)
- Any CLI that accepts a prompt argument

## License

MIT
