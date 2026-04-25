## Proactive Recovery

When a worker agent fails to start or errors immediately:

1. **Check the Agent tool error** from the `<task-notification>` result. Common failures:
   - `resource_exhausted` — model quota exceeded
   - Access/auth error — model not available on user's plan
   - Agent tool error — malformed prompt or parameters

2. **Suggest an alternative model:**
   - List the other models available in `~/.dispatch/config.yaml`.
   - Ask: "Want me to switch to [alternative] and retry?"
   - Example: "Opus hit a quota limit. Want me to retry with sonnet or haiku?"

3. **If the user agrees:**
   - Update `default:` in config to the alternative model (if the user wants to change the default).
   - Re-dispatch the task with the new model.

4. **If no alternatives work:**
   - Tell the user to check their Anthropic account/plan and try again later.
