## First-Run Setup

Triggered when `~/.dispatch/config.yaml` does not exist (checked in Step 0 or Modifying Config). Run through this flow, then continue with the original request.

### 1. Verify Claude Code is available

The dispatcher is always running inside Claude Code, so the CLI is available by definition. No detection needed — proceed directly to model selection.

### 2. Available models

Dispatch uses the Agent tool to spawn workers. The supported models are:

- **opus** — most capable, best for complex tasks
- **sonnet** — fast and capable, good balance
- **haiku** — fastest, best for simple tasks

These are stable aliases that auto-resolve to the latest version (e.g., `opus` → `claude-opus-4-6` today, and will resolve to newer versions as they release).

### 3. Present choices via AskUserQuestion

Ask: "Which model should be your default?"

Offer the three choices:
1. **opus** (Recommended for most tasks)
2. **sonnet** (Faster, good for simpler tasks)
3. **haiku** (Fastest, best for trivial tasks)

### 4. Generate `~/.dispatch/config.yaml`

```yaml
default: <user's chosen default>

models:
  opus: {}
  sonnet: {}
  haiku: {}
```

Rules:
- Include all three models — they're one-liners and it's better to have them available.
- Set user's chosen default.
- Run `mkdir -p ~/.dispatch` then write the file.

### 5. Continue

Proceed with the original dispatch or config request — no restart needed.

### Example

```
User: /dispatch "review the auth module"

Dispatcher: [no ~/.dispatch/config.yaml found — running first-run setup]
Dispatcher: Dispatch uses Claude models via the Agent tool. Which model should be your default?
  1. opus (Recommended)
  2. sonnet
  3. haiku

User: opus

Dispatcher: [generates ~/.dispatch/config.yaml with opus/sonnet/haiku, default: opus]
Dispatcher: Config created at ~/.dispatch/config.yaml. Default: opus.
Dispatcher: [continues with the original task — dispatches review using opus]
```
