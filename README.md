<h1>/dispatch&nbsp;<img src="skills/dispatch/assets/logo.svg" alt="Dispatch logo" height="56" /></h1>

**Dispatch 10x's Claude Code's effective context window size.** Instead of filling your session with implementation, `/dispatch` turns it into a lightweight orchestrator — work fans out to background agents, each with their own full context window.

<p align="center">
  <img src="skills/dispatch/assets/before-after.jpg" alt="Before: a single session where context fills up fast doing tasks sequentially, with the user overwhelmed tracking everything. After: dispatch keeps your main session lean while workers execute in parallel with their own fresh contexts, and the dispatcher carries the cognitive load." width="900" />
</p>

> **Without dispatch:** You ask Claude to review code, refactor a module, write tests, and update docs. Each task fills the context window. By task 3, Claude is losing track. By task 5, you're starting a new session.
>
> **With dispatch:** You describe all 5 tasks. Workers execute in parallel with fresh contexts. Your main session stays lean. Questions surface to you when needed — no polling, no context lost.

```
/dispatch use sonnet to find better design patterns for the auth module
```

---

## Why dispatch

### Your session stays lean

Dispatch inverts the usual model: the main session becomes a **mediator**, not the thinker. It writes a checklist and hands it off. The actual implementation — reading code, reasoning about edge cases, writing tests — happens in fresh worker contexts that each get their own full window. Your main session's context is preserved for orchestration.

### The dispatcher carries the cognitive load

With `claude --background`, multiple terminals, or fire-and-forget agent runners — _you_ are the orchestrator. You track what's running, check on progress, notice failures, and context-switch between outputs.

With dispatch, the AI dispatcher tracks all workers, surfaces questions, reports completions, handles errors, and offers recovery. Your job reduces to: **(a)** describe what you want, **(b)** answer questions when asked.

### Workers ask questions back

When a `/dispatch` worker gets stuck, it doesn't silently fail or hallucinate. It **asks a clarifying question** — the dispatcher surfaces it to you, you answer, and the worker continues **without losing context**. No restart, no re-explaining, no lost work.

```
Worker is asking: "requirements.txt doesn't exist. What feature should I implement?"
> Add a /health endpoint that returns JSON with uptime and version.

Answer sent. Worker is continuing.
```

### Non-blocking — you never wait

The moment a worker is dispatched, your session is **immediately free**. Dispatch another task. Ask a question. Write code. Workers run in parallel and results arrive as they complete.

### Any model, one interface

Mix models per task. Claude for deep reasoning, GPT for broad generation, Gemini for speed. Reference any model by name — if it's not in your config, `/dispatch` auto-discovers and adds it. If multiple models are named in one prompt, dispatch uses the last one mentioned. If no model is specified, dispatch confirms your default before proceeding.

```
/dispatch use opus to review this PR for edge cases
/dispatch use gemini to refactor the config parser — it's getting unwieldy
```

---

> **Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as your host session.** Dispatch is a skill that runs _inside_ Claude Code — the host plans tasks and spawns workers. Other CLIs like [Cursor](https://docs.cursor.com/) and [Codex](https://github.com/openai/codex) work as **workers only** (background agents that execute subtasks).

## Install

```bash
npx skills add bassimeledath/dispatch -g     # user-level (all projects)
npx skills add bassimeledath/dispatch        # project-level (team-shared)
```

## How it works

1. You run `/dispatch task description`
2. A checklist plan is created — *the only context your main session needs*
3. A background worker picks it up in a **fresh, full context window** and checks off items as it goes
4. If the worker has a question, it asks — you answer — it continues *(no context lost in either direction)*
5. You get results when it's done, or ask for status anytime — *your main session is still lean*

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

**Host (required):**
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`)

**Workers (optional — for multi-model dispatch):**
- [Cursor CLI](https://docs.cursor.com/) (`agent`)
- [Codex CLI](https://github.com/openai/codex) (`codex`)
- Any CLI that accepts a prompt argument

## Updating

**Skills CLI (recommended):**

```bash
npx skills update
```

This updates all installed skills to their latest versions. Run `npx skills check` first to see what's changed.

**Symlinked to a local clone?** If your `.claude/skills/dispatch` is a symlink to a local git checkout, just pull:

```bash
cd /path/to/your/dispatch && git pull
```

Changes are picked up immediately — Claude Code hot-reloads skills from disk.

## Architecture

The dispatcher reads your config, creates a checklist plan, then spawns a background worker and monitor. The worker executes each item and checks it off. If it needs clarification, it writes a question to the IPC directory — the monitor detects it and notifies the dispatcher, which surfaces it to you and relays your answer back, all without the worker losing context.

<p align="center">
  <img src="skills/dispatch/assets/architecture.png" alt="Sequence diagram showing the dispatch flow: user triggers dispatch, dispatcher creates plan and spawns worker + monitor, worker executes checklist items, IPC handles questions and answers, monitor detects completion and notifies dispatcher." width="900" />
</p>

## License

MIT
