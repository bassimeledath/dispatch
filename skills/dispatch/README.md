# /dispatch

**You don't need 6 terminals.** You need one session that delegates.

`/dispatch` turns your AI coding session into a command center. You describe work, it plans a checklist, fans out to background workers — opus, sonnet, haiku — and tracks progress. You stay in one clean session. Workers do the heavy lifting in isolated contexts.

<p align="center">
  <img src="assets/before-after.svg" alt="Architecture diagram: Your Session sends a task to the Dispatcher, which fans out to Opus, Sonnet, and Haiku workers in parallel, with a feedback loop for questions and progress." width="900" />
</p>

```
/dispatch "do a security review of this project"
```

---

## Why dispatch

### Your main session stays lean

The dispatcher **never does the actual work**. It plans, delegates, and tracks. The heavy reasoning — code review, refactoring, test writing — happens in isolated worker contexts. Your main session's context window is preserved for orchestration, not consumed by implementation details.

### Workers ask questions back

This is the part most agent orchestrators get wrong. When a `/dispatch` worker gets stuck, it doesn't silently fail or hallucinate. It **writes a clarifying question** — the dispatcher surfaces it to you, you answer, and a new worker picks up where the previous one left off with your answer and full context.

```
Worker is asking: "requirements.txt doesn't exist. What feature should I implement?"
> Add a /health endpoint that returns JSON with uptime and version.

Answer sent. New worker continuing from where the previous one left off.
```

### Non-blocking — you never wait

The moment a worker is dispatched, your session is **immediately free**. Dispatch another task. Ask a question. Write code. The dispatcher handles multiple workers in parallel, reports results as they arrive, and surfaces questions only when they need your input. No polling, no tab-switching, no "is it done yet?"

### Choose the right model per task

Pick the right Claude model for each job. Opus for deep reasoning and complex tasks, sonnet for a fast and capable balance, haiku for quick simple tasks.

```
/dispatch "use sonnet to update the README"
```

---

## How it works

1. You run `/dispatch "task description"`
2. A checklist plan is created at `.dispatch/tasks/<id>/plan.md`
3. A background worker (Agent tool subagent) picks it up and checks off items as it goes
4. If the worker has a question, it writes it to an IPC file and exits — you answer — a new worker continues
5. You get results when it's done, or ask for status anytime

## Setup

On first run, `/dispatch` asks which Claude model you want as your default and generates `~/.dispatch/config.yaml`. No manual config needed.

## Configuration

Two sections in `~/.dispatch/config.yaml`:

**Models** — available Claude models:
```yaml
models:
  opus: {}
  sonnet: {}
  haiku: {}
```

**Aliases** — named shortcuts with optional role prompts:
```yaml
aliases:
  security-reviewer:
    model: opus
    prompt: >
      You are a security-focused reviewer. Prioritize OWASP Top 10.
```

See [`references/config-example.yaml`](references/config-example.yaml) for the full example.

## Adding models

Add Claude model variants to your config:

```
/dispatch "add opus-4.5-thinking to my config"
```

## Plan markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending |
| `[x]`  | Done |
| `[?]`  | Blocked — waiting for your answer |
| `[!]`  | Error |

## Host compatibility

**Host (the session where you type `/dispatch`):** Claude Code.

**Workers:** Spawned via the Agent tool as background subagents. Supports opus, sonnet, and haiku models.

## Best practice: warm up at session start

Run `/dispatch` with no arguments at the beginning of a session to pre-load your config:

```
/dispatch
```

This reads `~/.dispatch/config.yaml` into the dispatcher's context so subsequent dispatches are faster and don't need confirmation prompts. It's a good habit to add as a [Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory) so you remember to do it each session:

> "Run /dispatch at the start of each session to warm up the config."

## Cleanup

Delete `.dispatch/` to clean up task files.
