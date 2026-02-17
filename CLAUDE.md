# Mise - Development Guide

## Overview

Mise is a CLI orchestrator for long-running AI coding agents. It breaks large tasks into structured plans, executes them through Claude Code, and verifies results with backpressure checks.

## Development Workflow

Most changes to mise should go through the mise flow itself:

```bash
mise init
mise prep "description of the change"
mise loop
```

This is the primary way to iterate on the tool. Direct manual edits are fine for quick fixes, but features and refactors should use mise to validate the tool's own workflow.

## Build & Test

```bash
npm run build        # tsc compile
npm run test         # vitest run
npm run dev          # tsx src/index.ts (dev mode)
```

After changes, `npm run build` is required. Global installs via `npm install -g .` symlink to `dist/`, so a rebuild makes changes immediately available.

## Architecture

- `src/index.ts` - CLI entry point (Commander.js). Registers all commands and handles bare-prompt shorthand.
- `src/cli/commands/` - Command implementations (init, prep, run, loop, status, log, feedback).
- `src/core/` - Orchestration logic (board, backpressure, brief, lock, signals, progress, readiness).
- `src/engines/claude.ts` - Claude Code CLI adapter. Spawns `claude -p` with stream-json output.
- `src/parallel/` - Parallel execution via git worktrees (scheduler, dispatch, merge).
- `src/types/` - Zod schemas for board, station, status.
- `src/utils/` - Helpers (detect, config, prompt, output, git).
- `src/prompts/` - Markdown templates for planning and task execution prompts.
- `templates/` - Scaffolding templates (gitignore, toc).

## Key Patterns

- **Fresh context per task**: No conversation history. Each task gets a clean prompt with board state from disk.
- **Backpressure**: After each task, runs test/lint/build/typecheck. Only commands that pass during `init` are enforced.
- **Engine env**: When spawning Claude CLI, must clear `CLAUDE_CODE_ENTRYPOINT` and `CLAUDECODE` env vars to avoid nested-session detection.
- **Commit format**: `mise(<task-id>): <title>`

## CI / Automation

- **Auto docs update** (`.github/workflows/update-docs.yml`): On every merge to `main`, a GitHub Action diffs the merge commit, passes it to Claude, and opens a PR with any needed updates to README.md and/or CLAUDE.md. Uses `[docs-bot]` in the commit message to prevent infinite loops. Requires `ANTHROPIC_API_KEY` repo secret.

## Repo

GitHub: `bassimeledath/mise`
