# Dispatch - Development Guide

Dispatch is a skill (`/dispatch`) for Claude Code that decomposes large coding tasks into subtasks, dispatches them to background AI worker agents, and tracks progress via checklist-based plan files.

## Quick Reference

| Topic | Doc |
|-------|-----|
| Flow diagram, components, design patterns | [docs/architecture.md](docs/architecture.md) |
| Config schema, command construction, model detection | [docs/config.md](docs/config.md) |
| Monitor-based IPC, question/answer flow, atomic writes | [docs/ipc-protocol.md](docs/ipc-protocol.md) |
| Local dev setup, symlink structure, CI | [docs/development.md](docs/development.md) |

## Conventions

- **Task IDs**: Short, descriptive, kebab-case (`security-review`, `add-auth`, `fix-login-bug`).
- **Checklist markers**: `[x]` done, `[ ]` pending, `[?]` blocked, `[!]` error.
- **`.dispatch/` directory**: Ephemeral task state. Delete it to clean up.
- **Config location**: `~/.dispatch/config.yaml` (auto-generated on first run).
- **Skill source**: `skills/dispatch/SKILL.md` is the canonical skill definition. Do NOT modify it for docs changes.
- **Warm-up invocation**: Running `/dispatch` with no arguments (or just the word "dispatch") reads `~/.dispatch/config.yaml` and stops — it does not proceed to task planning. Used to pre-load config at session start.
- **Multi-model resolution**: If multiple models are named in a single prompt, dispatch uses the last one mentioned. If no model is mentioned, dispatch confirms the default model with the user before proceeding.
- **Failure recovery**: If a worker's model fails (auth error, quota, CLI unavailable), the user is prompted for an alternative and config is updated to avoid the same failure again.

## Local Development

The symlink `.claude/skills/dispatch` → `../../.agents/skills/dispatch` makes the skill available as `/dispatch` when developing in this repo. The development source is `skills/dispatch/`; the `.agents/skills/dispatch/` copy is the installed version (from `npx skills add`).

## CI / Automation

- **Auto docs update** (`.github/workflows/update-docs.yml`): On every merge to `main`, a GitHub Action diffs the merge commit, passes it to Claude, and opens a PR with any needed updates to files in `docs/`. Uses `[docs-bot]` in the commit message to prevent infinite loops. Requires `ANTHROPIC_API_KEY` repo secret.

## Repo

GitHub: `bassimeledath/dispatch`
