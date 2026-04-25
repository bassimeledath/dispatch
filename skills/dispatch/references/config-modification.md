## Modifying Config

1. Read `~/.dispatch/config.yaml`. If it doesn't exist, run **First-Run Setup** (above), then continue.

2. Apply the user's requested change. The config has `default`, `models`, and `aliases`.

**Adding a model:**
- Verify it's a supported Claude model (opus, sonnet, haiku, or versioned variants like `sonnet-4.6`, `opus-4.5-thinking`).
- Add to `models:` — e.g., `opus-4.5-thinking: {}`
- If not a recognized Claude model, tell the user: "Dispatch only supports Claude models (opus, sonnet, haiku)."

**Creating an alias:**
- Add to `aliases:` with the target model and optional prompt.
- Example:
```yaml
aliases:
  security-reviewer:
    model: opus
    prompt: >
      You are a security-focused reviewer. Prioritize OWASP Top 10
      vulnerabilities, auth flaws, and injection risks.
```

**Changing the default:**
- Update the `default:` field.

**Removing a model:**
- Delete from `models:`. If it was the default, ask the user for a new default.

3. Run `mkdir -p ~/.dispatch` then write the updated file to `~/.dispatch/config.yaml`.
4. Tell the user what you changed. Done.

**Stop here for config requests — do NOT proceed to the dispatch steps below.**
