# Config System

Workers are configured via `~/.dispatch/config.yaml`.

## Schema

```yaml
default: opus  # Default model (by name or alias)

models:
  opus: {}
  sonnet: {}
  haiku: {}

aliases:
  security-reviewer:
    model: opus
    prompt: >
      You are a security-focused reviewer.
  quick:
    model: sonnet
```

## How Models Are Resolved

All workers are spawned via the Agent tool. The config model name maps to the Agent tool's `model` parameter:

| Config model | Agent tool `model` |
|-------------|-------------------|
| `opus`, `opus-4.6`, `opus-4.5`, `opus-4.6-thinking`, `opus-4.5-thinking` | `"opus"` |
| `sonnet`, `sonnet-4.6`, `sonnet-4.5`, `sonnet-4.6-thinking`, `sonnet-4.5-thinking` | `"sonnet"` |
| `haiku`, `haiku-4.5` | `"haiku"` |

For aliases, the alias's `model` is resolved the same way, and any `prompt` addition is prepended to the worker prompt.

## Key Config Patterns

- **Simple model list**: Models are just names — no backend commands or CLI flags needed. The Agent tool handles everything.
- **First-run setup**: On first use (no config file), the dispatcher presents opus/sonnet/haiku choices and generates the config. No manual YAML writing needed.
- **Aliases with prompt additions**: Named shortcuts (e.g., `security-reviewer`) that resolve to a model and optionally prepend role-specific instructions to the worker prompt.
- **Natural language config editing**: Users can say "change default to sonnet" or "create a security-reviewer alias" and the dispatcher reads, edits, and writes `~/.dispatch/config.yaml` directly.
