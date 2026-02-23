# Config System

Workers are configured via `~/.dispatch/config.yaml`. The config uses a model-centric schema.

## Schema

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
  opus:            { backend: claude }
  sonnet:          { backend: claude }
  haiku:           { backend: claude }
  gpt-5.3-codex:  { backend: codex }
  gemini-3.1-pro:  { backend: cursor }

aliases:
  security-reviewer:
    model: opus
    prompt: >
      You are a security-focused reviewer.
  quick:
    model: sonnet
```

## How Commands Are Constructed

**Cursor backend** — append `--model`:
1. Look up model (e.g., `gemini-3.1-pro`) → `backend: cursor`
2. Look up backend → `agent -p --force --workspace "$(pwd)"`
3. Append `--model gemini-3.1-pro` → final command

**Claude backend** — do NOT append `--model`:
1. Look up model (e.g., `opus`, or a versioned ID like `sonnet-4.6`) → `backend: claude`
2. Use the backend command as-is. The Claude CLI manages its own model selection. Appending `--model` can cause access errors due to internal alias resolution.

**Codex backend** — append `--model`:
1. Look up model (e.g., `gpt-5.3-codex`) → `backend: codex`
2. Look up backend → `codex exec --full-auto -C "$(pwd)"`
3. Append `--model gpt-5.3-codex` → final command

For aliases, the alias's `model` is resolved the same way, and any `prompt` addition is prepended to the worker prompt.

## Model Detection Rules

> **Claude model detection:** Any model ID containing `opus`, `sonnet`, or `haiku` — including versioned variants (e.g., `sonnet-4.6`, `opus-4.5-thinking`) — is a Claude model and must use `backend: claude` when the Claude Code CLI is available. Never route Claude models through the cursor backend.

> **OpenAI model detection:** Any model ID containing `gpt`, `codex`, `o1`, `o3`, or `o4-mini` is an OpenAI model and must use `backend: codex` when the Codex CLI is available. Only fall back to `cursor` backend when Codex is not installed.

## Key Config Patterns

- **Model-centric config**: Backends define CLI commands once; models map to backends. For the Cursor and Codex backends, `--model` is appended automatically. For the Claude backend, `--model` is omitted (the CLI manages its own model selection). Adding a model is one line.
- **First-run setup**: On first use (no config file), the dispatcher detects CLIs, discovers available models via `agent models`, presents options via AskUserQuestion, and generates the config. No manual YAML writing needed.
- **Smart model resolution**: If a user references a model not in config, the dispatcher probes availability (`agent models`), auto-adds it, and dispatches — no config editing needed.
- **Aliases with prompt additions**: Named shortcuts (e.g., `security-reviewer`) that resolve to a model and optionally prepend role-specific instructions to the worker prompt.
- **Natural language config editing**: Users can say "add gpt-5.3 to my config" or "create a security-reviewer alias" and the dispatcher reads, edits, and writes `~/.dispatch/config.yaml` directly — no special commands needed.

## Backward Compatibility

Old `agents:` config format is still recognized. Each agent entry is treated as an alias with an inline command. The dispatcher suggests migration to the new format.
