## Example Interaction

### Normal flow (no questions)

```
User: /dispatch "do a security review of this project"

Dispatcher: [reads ~/.dispatch/config.yaml — default model: opus]
Dispatcher: [writes .dispatch/tasks/security-review/plan.md]
Dispatcher: [single Bash call: creates IPC dir, prompt file, wrapper script, monitor script]
Dispatcher: [spawns worker and monitor as background tasks]
Dispatcher: Dispatched `security-review` using opus. Plan:
  1. Scan for hardcoded secrets
  2. Review auth logic
  3. Check dependencies
  4. Audit injection risks
  5. Write findings report
What else?

[<task-notification> arrives — worker finished]

Dispatcher: [reads plan.md — all items checked]
Dispatcher: `security-review` complete. Found 2 issues:
  1. Hardcoded API key in config.ts:14
  2. No rate limiting on /api/login endpoint
Full report at .dispatch/tasks/security-review/output.md
```

### IPC flow (worker asks a question)

```
User: /dispatch "implement the feature described in requirements.txt"

Dispatcher: [writes plan, sets up scaffolding, spawns worker + monitor]
Dispatcher: Dispatched `impl-feature` using opus. Plan: ...

[<task-notification> arrives — monitor detected a question]

Dispatcher: [reads .dispatch/tasks/impl-feature/ipc/001.question]
Dispatcher: Worker is asking: "requirements.txt doesn't exist. What feature should I implement?"
User: Add a /health endpoint that returns JSON with uptime and version.

Dispatcher: [writes 001.answer atomically, respawns monitor]
Dispatcher: Answer sent. Worker is continuing.

[<task-notification> arrives — worker finished]

Dispatcher: [reads plan.md — all items checked]
Dispatcher: Done! /health endpoint implemented.
```

### First-run setup

```
User: /dispatch "review the auth module"

Dispatcher: [no ~/.dispatch/config.yaml found — running first-run setup]
Dispatcher: [runs `which agent` → found, `which claude` → found]
Dispatcher: [runs `agent models` → 15 models detected]
Dispatcher: Found Cursor CLI (15 models) and Claude Code. Notable models:
  - opus (Claude) — best for complex tasks
  - sonnet (Claude) — fast and capable
  - gpt-5.3-codex (GPT) — strong for code

AskUserQuestion: Which model should be your default?
  1. opus (Recommended)
  2. sonnet
  3. gpt-5.3-codex

User: opus

Dispatcher: [generates ~/.dispatch/config.yaml with all 15 models, default: opus]
Dispatcher: Config created at ~/.dispatch/config.yaml with 15 models. Default: opus.
Dispatcher: [continues with the original task — dispatches security review using opus]
```
