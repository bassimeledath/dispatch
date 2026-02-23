# Development

## Local Development

The symlink `.claude/skills/dispatch` → `../../.agents/skills/dispatch` makes the skill available as `/dispatch` when developing in this repo. The development source is `skills/dispatch/`; the `.agents/skills/dispatch/` copy is the installed version (from `npx skills add`).

## CI / Automation

- **Auto docs update** (`.github/workflows/update-docs.yml`): On every merge to `main`, a GitHub Action diffs the merge commit, passes it to Claude, and opens a PR with any needed updates to files in `docs/`. Uses `[docs-bot]` in the commit message to prevent infinite loops. Requires `ANTHROPIC_API_KEY` repo secret.
