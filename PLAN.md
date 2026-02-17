# Mise: Implementation Plan

A kitchen-grade CLI for long-running coding agents. The work before the work IS the work.

---

## 1. What Mise Is

Mise is a bash-loop-based CLI that orchestrates long-running coding agents using the operational principles of mise-en-place. Each iteration spawns a fresh agent session with a single task, reads all state from disk, runs verification, commits, and clears context. The orchestrator is deterministic bash — not an AI agent — which makes coordination predictable and debuggable.

Mise v1 is Claude Code-first. It shells out to Claude Code CLI and communicates exclusively through stdin prompts and stdout/stderr capture. The architecture keeps a thin adapter boundary so additional engines can be added later without changing core orchestration.

### Core beliefs

- **Fresh context per iteration is non-negotiable.** Files and git are the memory. The conversation is disposable. No compaction, no summarization, no accumulated history. The cleanest station is one that starts empty.
- **The orchestrator is bash, not AI.** Introducing AI nondeterminism into the coordination layer undermines the predictability that makes the system scale. The expediter doesn't cook.
- **Planning is recurring, not one-shot.** Plans are disposable artifacts that get regenerated when wrong. The system must be capable of discovering missing requirements mid-loop.
- **Parallelism is dynamic but safety-gated.** Mise defaults to automatic scheduling: it runs sequentially unless dependency and ownership checks prove tasks can run concurrently. When confidence is low, it falls back to sequential.
- **Attended mode is the safe default.** The agent can ask clarifying questions at any point. Autonomous mode is opt-in for well-specified tasks with strong verification.

---

## 2. Architecture Overview

```
User
  |
  v
mise (bash orchestrator)
  |
  |-- reads .mise/board.yaml (task queue)
  |-- reads .mise/brief.md (compacted memory)
  |-- reads .mise/station.yaml (project config)
  |-- runs readiness gate (missing env vars/services/blockers)
  |-- scheduler chooses sequential vs parallel batch
  |
  |-- spawns fresh AI session per task
  |      |-- receives: task card + toc.md + pointer to brief/docs
  |      |-- operates: reads/writes repo files, runs commands
  |      |-- produces: code changes, commits, status update
  |      |-- exits: context destroyed
  |
  |-- runs verification (test/lint/build)
  |-- writes evidence + status transitions atomically
  |-- updates board + brief + progress log
  |-- loops or exits
```

### What lives on disk (the "station")

| File | Purpose | Size target |
|---|---|---|
| `.mise/station.yaml` | Project config: language, framework, commands, rules, boundaries | ~30-60 lines |
| `.mise/board.yaml` | Task queue with deps, readiness inputs, acceptance criteria, parallel-safety flags | Scales with project |
| `.mise/brief.md` | Compacted memory: last N decisions, what changed, what's next | ~50-150 lines |
| `.mise/toc.md` | Table of contents pointing to deeper docs — the only file auto-injected into every prompt | ~50-100 lines |
| `.mise/toc.meta.yaml` | Fingerprints/sources used to generate toc and detect drift | ~20-40 lines |
| `.mise/progress.log` | Append-only, grep-friendly log of all iterations | Append-only |
| `.mise/status/` | Per-task durable status files (`pending`, `in_progress`, `blocked`, `complete`, `failed`) | Per-task |
| `.mise/clarifications/` | Questions written by agents, answers written by orchestrator | Per-task |
| `.mise/logs/` | Full command output per task (keeps it out of context) | Per-task |
| `.mise/evidence/` | Acceptance-criteria evidence per task (commands, outputs, notes) | Per-task |
| `.mise/run.lock` | Active loop lock + heartbeat for crash-safe resume | Single file |

### What is NOT on disk

- Conversation history. Each session starts clean.
- Compressed/compacted context. No server-side compaction.
- Orchestrator AI state. The orchestrator is bash.

### Brief lifecycle (v1)

`brief.md` is written by the orchestrator, not the task agent. To keep behavior deterministic and avoid hidden AI coordination:
- The orchestrator regenerates `brief.md` after each successful task (or merged parallel batch) from source-of-truth files: `board.yaml`, `.mise/status/*`, clarifications, and `progress.log`.
- The brief uses a fixed template with bounded sections: `Recent completions` (last N), `Open blockers`, `Active assumptions`, `Next ready tasks`.
- The brief is capped to a line budget (default 150 lines). Older entries roll off automatically.
- Regeneration is full rewrite (not unbounded append), so it cannot drift or grow forever.

### Repo hygiene (`.gitignore` and shared state)

Default recommendation:
- Commit: `.mise/station.yaml`, `.mise/board.yaml`, `.mise/toc.md`, and (optionally) `.mise/brief.md` if you want shared team context.
- Ignore: `.mise/logs/`, `.mise/status/`, `.mise/clarifications/`, `.mise/evidence/`, `.mise/worktrees/`, `.mise/run.lock`, and other runtime temp files.

Suggested `.gitignore` entries:
```gitignore
.mise/logs/
.mise/status/
.mise/clarifications/
.mise/evidence/
.mise/worktrees/
.mise/run.lock
```

---

## 3. The Four Phases

Every mise session flows through four phases. These can run as a single `mise run` invocation or be called independently. Prep includes a hard readiness gate so service does not begin on incomplete specs.

### Phase 1 — Mise (Station Setup)

**Principle:** Arranging spaces, perfecting movements.

**What happens:**
1. Auto-detect project language, framework, package manager, and test/lint/build commands by inspecting `package.json`, `Cargo.toml`, `pyproject.toml`, `Makefile`, etc.
2. Generate `.mise/station.yaml` with detected config. User can tune after.
3. Generate `.mise/toc.md` deterministically from a heuristic scan of high-signal files and directories.
4. Write `.mise/toc.meta.yaml` with source file list + content fingerprints used for drift detection.
5. Validate that backpressure commands actually work (run `test`, `lint`, `build` in a dry-run).
6. Run engine preflight (`engine_check`) to verify Claude CLI availability and auth.

**User flow:**
```
$ mise init

  Mise — station setup
  Detected: TypeScript / Next.js / pnpm

  Backpressure commands:
    test:      pnpm test           ... verified
    lint:      pnpm lint           ... verified
    build:     pnpm build          ... verified
    typecheck: pnpm tsc --noEmit   ... verified

  Engine:
    claude:    available + authenticated

  Station written to .mise/station.yaml
  Edit to add rules, boundaries, or overrides.
```

**Generated `.mise/station.yaml`:**
```yaml
project:
  name: "my-app"
  language: "typescript"
  framework: "nextjs"
  package_manager: "pnpm"

backpressure:
  test: "pnpm test"
  lint: "pnpm lint"
  build: "pnpm build"
  typecheck: "pnpm tsc --noEmit"

rules:
  # Project-specific conventions the agent must follow
  # - "use server actions, not API routes"
  # - "follow error handling pattern in src/utils/errors.ts"

boundaries:
  # Files/dirs the agent must never modify
  never_touch: []
    # - "src/legacy/**"
    # - "*.lock"

engine: "claude"    # v1: Claude Code only (additional engines in Phase B)
mode: "attended"    # attended | autonomous
runtime:
  max_parallel: 3
  heartbeat_seconds: 10
  lock_stale_after_seconds: 45
```

**When to run:** Once per project, or whenever project setup changes. Re-running is safe (merges with existing config).

**`toc.md` generation and freshness (v1):**
- Deterministic generation (no AI required): scan `README*`, `docs/**`, architecture/design files (`ARCHITECTURE*`, `DESIGN*`, `CONTRIBUTING*`, `PLAN*`), and project entrypoints (`src/main*`, `src/index*`, framework roots).
- Output format is concise: file path + one-line purpose + "when to read".
- If the project has no docs, fall back to a structural TOC from directory/file heuristics.
- Freshness check runs at the start of `mise prep` and `mise loop` by comparing fingerprints in `.mise/toc.meta.yaml`; on drift, toc is auto-regenerated with a notice.

---

### Phase 2 — Prep (Planning + Readiness Gate)

**Principle:** Planning is prime. Slowing down to speed up.

**What happens:**
1. Accept input in one of several forms (see Input Formats below).
2. Spawn a planning agent session that generates/refines `.mise/board.yaml`.
3. In attended mode: ask clarifying questions for ambiguous requirements before finalizing the board.
4. Run a readiness gate that identifies missing execution prerequisites (required env vars, external services, unresolved architectural blockers).
5. Present plan + blockers for approval. Unresolved blockers are persisted and prevent affected tasks from running.
6. Identify "first moves" — scaffolding tasks that unblock everything else.
7. Estimate context size per task (small/medium/large) and split anything too large.

**Input formats — how work enters the system:**

| Format | Example | Notes |
|---|---|---|
| Inline prompt | `mise prep "add dark mode support"` | Simplest. Agent generates plan from prompt. |
| PRD file | `mise prep --prd PRD.md` | Markdown with checkboxes, headings as groups. |
| YAML task file | `mise prep --prd tasks.yaml` | Structured tasks with deps and criteria. |
| GitHub issue(s) | `mise prep --issue 42,43,44` | Pulls issue body, generates plan. |
| Interactive | `mise prep` (no args) | Agent interviews user to build plan. |

**The prep conversation (attended mode):**
```
$ mise prep "build an auth system with OAuth and email/password"

  Prep — generating plan...

  Before I plan, a few questions:

  1. OAuth providers — Google and GitHub, or also Apple/Microsoft?
  > Google and GitHub only

  2. Email/password — do you need email verification flow?
  > Yes, with magic link option too

  3. Session management — JWT tokens or server-side sessions?
  > JWT with refresh tokens

  4. Any existing auth code or starting from scratch?
  > Scratch, but use next-auth if it fits

  Plan generated:

  Group 1 (first moves):
    [1] scaffold-auth — Create auth module with types and interfaces [small]
    [2] setup-next-auth — Install and configure next-auth [small]
  Group 2 (parallel):
    [3] oauth-google — Google OAuth provider [medium]
    [4] oauth-github — GitHub OAuth provider [medium]
    [5] email-password — Email/password with bcrypt [medium]
  Group 3:
    [6] magic-link — Magic link email flow [medium]
    [7] jwt-refresh — JWT refresh token rotation [medium]
  Group 4:
    [8] auth-tests — Integration tests for all auth flows [large]

  Approve? [Y/n/edit]
```

**Generated `.mise/board.yaml`:**
```yaml
tasks:
  - id: scaffold-auth
    title: "Create auth module scaffold with types and interfaces"
    group: 1
    first_move: true
    size: small
    parallel_safe: true
    acceptance_criteria:
      - "Auth types exported from src/lib/auth/types.ts"
      - "Auth config skeleton in src/lib/auth/config.ts"
      - "All backpressure passes"
    required_inputs:
      env_vars: []
      services: []
      credentials: []
      migrations: []
    blocking_questions: []
    assumptions: []
    status: pending

  - id: oauth-google
    title: "Implement Google OAuth provider via next-auth"
    group: 2
    depends_on: [scaffold-auth, setup-next-auth]
    size: medium
    parallel_safe: true
    owned_paths: ["src/lib/auth/providers/google*"]
    acceptance_criteria:
      - "Google OAuth login flow works end-to-end"
      - "Callback URL configurable via env var"
      - "User profile data persisted on first login"
      - "All backpressure passes"
    required_inputs:
      env_vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXTAUTH_URL"]
      services: []
      credentials: ["google-oauth-app"]
      migrations: []
    blocking_questions: []
    assumptions:
      - "Using next-auth GoogleProvider"
    status: pending

  # ... remaining tasks follow same structure
```

**Board + status ownership (v1):**
- `board.yaml` is planning + summary status (`pending`, `blocked`, `complete`, `failed`) for UX and sharing.
- `.mise/status/{task-id}.yaml` is runtime state (`in_progress`, attempts, heartbeat, blocked reason, timestamps).
- Orchestrator updates both atomically when transitioning states.

Valid task transitions:
- `pending -> in_progress -> complete`
- `pending -> in_progress -> blocked`
- `pending -> in_progress -> failed`
- `blocked -> pending` (after clarification is answered)
- `failed -> pending` (manual retry/replan)

**Task scoping rule (the Meeze Point):** Target ~90% of the agent's effective context window, with a hard cap near ~95% to leave headroom for tool output and retries. If a task would exceed that (e.g., "rewrite the entire auth system"), the planning phase must split it into smaller tasks. The planning agent estimates this based on the number of files likely touched, complexity of acceptance criteria, and project size.

**Plan regeneration:** At any point during execution, the user can run `mise replan` to regenerate the remaining plan. The planning agent receives the current board state (completed + remaining tasks), the brief, and the codebase, and produces an updated plan. Plans are disposable — regeneration is cheap and normal.

---

### Phase 3 — Service (Execution)

**Principle:** Finishing actions. Cleaning as you go. Call and callback.

This is the core loop. Mise uses an adaptive scheduler (`--parallel auto` by default): it runs sequentially most of the time, and automatically launches parallel batches only when safety checks pass.

#### Adaptive service (default)

```bash
# Pseudocode — actual implementation is a bash script
preflight_engine_or_exit       # claude installed + authenticated
acquire_run_lock_or_exit       # atomic lock acquisition
trap_signals_for_graceful_stop # SIGINT/SIGTERM

while has_pending_tasks; do
  batch=$(next_ready_batch_auto "$MAX_PARALLEL")  # one task or a safe parallel set

  if [ "$(batch_size "$batch")" -gt 1 ]; then
    run_parallel_batch "$batch" || fallback_to_sequential "$batch"
  else
    run_single_task "$(first_task "$batch")"
  fi
done

release_run_lock
```

**What the agent receives each iteration:**

1. **System context** (always injected):
   - `.mise/toc.md` — table of contents, ~50-100 lines
   - Task card from board.yaml — title, acceptance criteria, assumptions
   - Mode instructions — "you are implementing one task; commit when done"

2. **Available on disk** (agent reads as needed):
   - `.mise/brief.md` — recent decisions, what changed, what to know
   - `.mise/station.yaml` — project rules and boundaries
   - Full codebase via file read tools
   - `docs/` directory for architecture and specs

3. **NOT provided:**
   - Other tasks' details (agent doesn't see the full board)
   - History from previous iterations
   - Other agents' conversations

**Mid-service clarification (attended mode):**

When an agent encounters ambiguity during execution that isn't covered by the task card or project docs:

1. Agent writes a question to `.mise/clarifications/{task-id}.md`
2. Agent signals it's paused (writes `status: blocked` to its status file)
3. Orchestrator detects the pause, surfaces the question in the terminal:
   ```
     Agent asks: "The Google OAuth callback URL pattern
     differs between next-auth v4 and v5. The project uses
     next-auth 5.x. Should I use the v5 /auth/callback/google
     pattern or the legacy /api/auth/callback/google?"
   > Use v5 pattern
   ```
4. Orchestrator writes the answer to the clarification file
5. Agent resumes (in practice: the orchestrator re-spawns a fresh session with the answer included in the task card, since context was destroyed)

**In autonomous mode:** The agent makes a best-judgment call, documents the assumption in the progress log, and continues. Assumptions are surfaced in the completion summary for human review.

**Blocking-only clarification policy (to avoid unnecessary questions):**
- Ask only when missing information blocks correctness, safety/security, irreversible schema/data changes, or external integration viability.
- Do not ask for preference-only decisions (naming/style/minor structure); make a reasonable choice and document it.
- Every clarification must state: "Why this blocks acceptance criteria."
- If unresolved, task remains `blocked` and cannot be marked `complete`.

#### Auto-parallel batches (scheduler-selected)

Parallel execution activates when:
- Multiple tasks in the same group are marked `parallel_safe: true`
- Their `owned_paths` don't overlap
- All dependencies are satisfied
- No unresolved blockers remain for those tasks
- Scheduler confidence meets threshold for safe parallel execution
- User hasn't set `--parallel off` (manual override)
- If `--parallel N` is set, concurrency is capped at `N`

```bash
for group in $(get_groups); do
  tasks=$(get_ready_tasks_in_group "$group")

  if can_parallelize "$tasks"; then
    # Launch parallel workers in isolated worktrees
    for task in $tasks; do
      branch="mise/$task_id"
      git worktree add ".mise/worktrees/$task_id" -b "$branch"
      launch_agent_in_worktree "$task" &
    done

    wait  # All workers in group must complete

    # Merge all branches back
    merge_group_branches "$group"

    # Integration backpressure on merged result
    run_backpressure || handle_merge_failure "$group"
  else
    # Fall back to sequential
    for task in $tasks; do
      run_solo_iteration "$task"
    done
  fi
done
```

**Worktree isolation:** Each parallel agent operates in its own git worktree on its own branch. Agents cannot see each other's changes until the group merge. This eliminates file conflicts during execution. Conflicts surface only at merge time and are resolved by a dedicated merge iteration (a fresh agent session that sees both diffs and resolves).

**Fallback:** If worktree creation fails (e.g., bare repo, submodules), fall back to sequential execution automatically with a warning.

**Commit + merge strategy (v1):**
- Worker branch commit format: `mise(<task-id>): <task-title>`.
- Required trailers: `Mise-Task: <task-id>` and `Mise-Run: <run-id>`.
- Orchestrator verifies that a commit exists for the task before marking `complete`.
- If the agent exits with file changes but no commit, the orchestrator creates the task commit with the standard format.
- Parallel group merges are orchestrator-controlled and deterministic (stable task order). Default strategy is non-fast-forward merge preserving per-task history.

**Auto-parallel UX:**
```
  Service — group 2 firing (2 parallel)

  Agent 1: oauth-google (mise/oauth-google)
  Agent 2: oauth-github (mise/oauth-github)

  [oauth-github]  complete (6m 18s)
  [oauth-google]  complete (8m 42s)

  Merging group 2... no conflicts
  Pass: test ok  lint ok  build ok  typecheck ok
```

---

### Phase 4 — Pass (Review)

**Principle:** Inspect and correct. Total utilization.

The pass is the quality gate. Backpressure means code cannot move forward as `complete` until deterministic checks pass. It operates at two levels:

#### Automated pass (every iteration)

After every agent iteration, the orchestrator runs backpressure commands from `station.yaml`:
```bash
run_backpressure() {
  local failed=0
  for cmd in test lint build typecheck; do
    if [ -n "${backpressure[$cmd]}" ]; then
      eval "${backpressure[$cmd]}" > ".mise/logs/$task_id/$cmd.log" 2>&1
      if [ $? -ne 0 ]; then
        failed=1
        echo "  FAIL: $cmd — see .mise/logs/$task_id/$cmd.log"
      fi
    fi
  done
  return $failed
}
```

If backpressure fails, the orchestrator can:
1. **Retry (default):** Spawn a new agent session with the failure output included in the prompt. The agent sees exactly what failed and fixes it. Up to N retries (configurable, default 2).
2. **Skip:** Mark the task as failed and continue (if `--skip-failures` is set).
3. **Stop:** Halt the loop and surface the failure to the user.

#### Completion contract (anti-fake guard)

A task is `complete` only when all of the following are true:
1. Acceptance criteria are mapped to explicit evidence in `.mise/evidence/{task-id}.md`.
2. Required backpressure checks pass.
3. No unresolved blocking clarification exists.
4. If a criterion cannot be verified due to missing prerequisites (e.g., env vars), the task is `blocked` or `failed`, not `complete`.

#### Enhanced pass (optional reviewer)

When `--review` is enabled, a separate agent session reviews each completed task's diff:
- The reviewer sees: the diff, the task card, the test output, and nothing else.
- The reviewer has no context from the implementation — fresh eyes.
- The reviewer can: approve, request changes (which triggers another worker iteration), or flag for human review.
- Reviewer rubric: acceptance-criteria coverage, rules/boundaries compliance, and no out-of-scope changes.

This mirrors the kitchen's pass inspection — the chef de cuisine tasting every plate before it leaves.

#### Human pass (attended mode, per-group)

After each parallel group merges and passes automated verification, the orchestrator can pause for human review:
```
  Group 2 merged and verified.
  Review before continuing? [Y/n]
```

This is optional and configurable. Default: pause only after the final group.

---

## 4. CLI Interface

### Commands

| Command | Purpose |
|---|---|
| `mise [prompt]` | Shorthand for `mise prep "<prompt>"` then `mise loop` (with approval prompts in attended mode) |
| `mise init` | Station setup — detect project, generate config |
| `mise prep [prompt]` | Generate or refine the task plan |
| `mise prep --prd <file>` | Generate plan from PRD/task file |
| `mise run` | Execute the next single task (one iteration) |
| `mise loop` | Execute all remaining tasks in a crash-safe, resumable loop |
| `mise replan` | Regenerate plan for remaining tasks |
| `mise sweep` | Scan for drift/entropy, add cleanup tasks |
| `mise status` | Show current board state and progress |
| `mise log` | Show progress log |

### Flags

| Flag | Default | Purpose |
|---|---|---|
| `--autonomous` | off | No clarifying questions; agent makes best-judgment calls |
| `--attended` | on | Agent can pause and ask questions |
| `--parallel auto\|off\|N` | `auto` | Dynamic scheduler: sequential by default, auto-parallel when safe; `N` sets max concurrent agents |
| `--fast` | off | Use fast verification (smoke tests only) *(Phase B)* |
| `--review` | off | Enable reviewer pass after each task *(Phase C)* |
| `--model <name>` | claude default | Override Claude model (e.g., `opus` for planning, `sonnet` for execution) |
| `--retries N` | 2 | Max backpressure retry attempts per task |
| `--skip-failures` | off | Continue past failed tasks |
| `--dry-run` | off | Show what would execute without running *(Phase B)* |
| `--budget <dollars>` | none | Stop if estimated cost exceeds budget *(Phase B)* |
| `--verbose` | off | Print full agent output to terminal |

**v1 engine scope:** Claude Code only. Multi-engine support is deferred to Phase B.
Flags marked with Phase labels are planned but not part of Phase A implementation.

### Simplest invocations

```bash
# One-liner shorthand (equivalent to: mise prep "<prompt>" && mise loop)
mise "add a logout button to the navbar"

# PRD-driven, all defaults
mise --prd PRD.md

# Auto-parallel with review
mise --prd plan.yaml --parallel auto --review

# Autonomous mode for well-specified work
mise --prd tasks.yaml --autonomous

# Just plan, don't execute
mise prep "refactor the payment module"

# Just run the next task
mise run

# Continue the loop
mise loop
```

---

## 5. User Flows

### Flow 1: Quick single task (the "just do it" flow)

```
$ mise "add dark mode toggle to the settings page"

  Mise — station loaded (.mise/station.yaml)

  Prep — planning...

  1 task:
    [1] dark-mode-toggle — Add dark mode toggle to settings [medium]
        Acceptance: toggle visible, persists preference,
        respects system preference, backpressure passes

  Approve? [Y/n] y

  Service — firing task 1/1

    dark-mode-toggle  implementing...

    Agent asks: "Acceptance says 'persists preference'. Should this
    persist per-browser (localStorage) or per-user (database)?
    This blocks schema/API choices needed for correctness."
  > Per-browser for now using localStorage

    dark-mode-toggle  complete (4m 12s)
    Pass: test ok  lint ok  build ok

  Done. 1/1 tasks complete.
```

### Flow 2: PRD-driven multi-task project

```
$ mise --prd auth-prd.md --attended

  Mise — station loaded

  Prep — parsing PRD...

  8 tasks across 4 groups:

  Group 1 (first moves):
    [1] scaffold-auth [small]
    [2] setup-next-auth [small]
  Group 2 (parallel):
    [3] oauth-google [medium]
    [4] oauth-github [medium]
    [5] email-password [medium]
  Group 3:
    [6] magic-link [medium]
    [7] jwt-refresh [medium]
  Group 4:
    [8] auth-tests [large]

  Approve? [Y/n] y

  Service — group 1 (2 tasks, sequential — first moves)

    [1] scaffold-auth        complete (2m 14s)  Pass: ok
    [2] setup-next-auth      complete (3m 08s)  Pass: ok

  Service — group 2 (3 tasks, parallel)

    Agent 1: oauth-google
    Agent 2: oauth-github
    Agent 3: email-password

    [5] email-password       complete (7m 44s)
    [4] oauth-github         complete (8m 12s)

    Agent 1 asks: "Google requires a verified redirect URI
    in production. Should I add a GOOGLE_REDIRECT_URI env var
    or derive it from NEXTAUTH_URL?"
  > Derive from NEXTAUTH_URL

    [3] oauth-google         complete (10m 33s)
    Merging group 2... no conflicts
    Pass: test ok  lint ok  build ok

  Service — group 3 (2 tasks, sequential)

    [6] magic-link           complete (6m 02s)  Pass: ok
    [7] jwt-refresh          complete (5m 41s)  Pass: ok

  Service — group 4 (1 task)

    [8] auth-tests           complete (12m 18s) Pass: ok

  Done. 8/8 tasks complete.
  Total: 47m 22s | Iterations: 10 (2 retries)
```

### Flow 3: Autonomous mode with budget

```
$ mise --prd tasks.yaml --autonomous --budget 10 --parallel auto

  Mise — autonomous mode (no clarifying questions)
  Budget: $10.00

  Prep — plan loaded (12 tasks, 5 groups)

  Service — running...
    [1]  scaffold        complete   $0.12
    [2]  api-types       complete   $0.18
    [3]  user-endpoint   complete   $0.45   (1 retry)
    [4]  post-endpoint   complete   $0.38
    ...
    [9]  search          complete   $0.92
    [10] pagination      complete   $0.41

  Budget remaining: $2.14
    [11] caching         complete   $0.88

  Budget remaining: $1.26
    [12] perf-tests      SKIPPED — estimated cost $1.80 exceeds remaining budget

  Done. 11/12 tasks complete. 1 skipped (budget).
  Total cost: $8.74
```

### Flow 4: Replan mid-execution

```
$ mise loop

  Resuming from task 4/8...

    [4] oauth-github     complete   Pass: ok

  [!] Task 5 (email-password) failed after 2 retries.
      Last error: bcrypt native module build fails on this Node version

  Options:
    [c] Continue to next task
    [r] Retry with guidance
    [p] Replan remaining tasks
    [s] Stop
  > p

  Replan — regenerating plan for remaining 4 tasks...

  The agent suggests:
    - Replace bcrypt with bcryptjs (pure JS, no native deps)
    - Merge email-password and magic-link into one task
    - Keep jwt-refresh and auth-tests as-is

  Updated plan (3 remaining tasks):

    [5'] email-auth (combined) [medium]
    [6'] jwt-refresh [medium]
    [7'] auth-tests [large]

  Approve? [Y/n] y

  Continuing...
```

### Flow 5: Interactive prep (no PRD)

```
$ mise prep

  Prep — interactive planning

  What do you want to build?
  > I need to add real-time notifications to the app

  Let me ask a few questions:

  1. What kind of notifications? (push, in-app, email, SMS)
  > In-app only for now, with a bell icon and dropdown

  2. Real-time tech preference? (WebSockets, SSE, polling)
  > Whatever fits best with Next.js

  3. Should notifications persist (database) or be ephemeral?
  > Persist, users should see history

  4. Any existing notification code or models?
  > Nothing, starting fresh

  Plan generated:

  Group 1 (first moves):
    [1] notification-model — DB schema + Prisma model [small]
    [2] notification-api — CRUD API routes [small]
  Group 2 (parallel):
    [3] sse-provider — SSE endpoint for real-time delivery [medium]
    [4] notification-ui — Bell icon + dropdown component [medium]
  Group 3:
    [5] notification-triggers — Hook into existing actions [medium]
    [6] notification-tests — E2E tests [large]

  Save plan? [Y/n] y
  Plan saved to .mise/board.yaml
  Run `mise loop` to start execution.
```

### Flow 6: Sweep (entropy cleanup)

```
$ mise sweep

  Sweep — scanning for drift...

  Found 4 issues:

  [1] Dead export: src/utils/format.ts exports `formatCurrency`
      but no file imports it (introduced in task oauth-google)
  [2] Inconsistent error handling: src/lib/auth/providers/google.ts
      uses try/catch, but project pattern is Result type
  [3] Missing test: src/lib/auth/refresh.ts has 0% coverage
  [4] Unused dependency: `lodash` in package.json,
      only `lodash.debounce` is used

  Add to board as cleanup tasks? [Y/n/select] y

  4 cleanup tasks added to board (group: cleanup, parallel_safe: true)
  Run `mise loop` to execute.
```

---

## 6. Prompt Engineering

### The task prompt template

Each agent iteration receives a prompt constructed from templates. The prompt is structured to minimize token usage while providing sufficient context.

```
You are implementing a single task in a software project.

## Your task
{task.title}

### Acceptance criteria
{task.acceptance_criteria}

### Assumptions
{task.assumptions}
{task.clarification_answers}

## Project context
{contents of .mise/toc.md}

## Recent context
Read `.mise/brief.md` for recent decisions and changes.
Read files in the codebase as needed. Do not assume file contents.

## Rules
{station.rules}

## Boundaries
Never modify: {station.boundaries.never_touch}

## Instructions
1. Read the brief and relevant source files to understand current state.
2. Implement the task according to acceptance criteria.
3. Run verification: {station.backpressure commands}
4. If verification fails, fix the issues and re-run.
5. Write acceptance evidence to `.mise/evidence/{task.id}.md` (criteria -> proof).
6. Do not claim completion without verifiable evidence; if blocked, report `blocked` with reason.
7. When all criteria are met, evidence is recorded, and verification passes, commit your changes using:
   `mise({task.id}): {short title}`
8. Write a short summary of what you did to stdout.

{if mode == attended}
Ask a clarification question only if blocked on correctness/safety/security,
irreversible schema/data decisions, or external integration viability.
When asking, include: "Why this blocks acceptance criteria."
Write the question to .mise/clarifications/{task.id}.md and stop.
Do not ask preference-only questions.
{/if}

{if mode == autonomous}
If you encounter ambiguity, make your best judgment call and document
the assumption in your commit message.
{/if}
```

### The planning prompt template

```
You are a planning agent for a software project. Your job is to
create a task plan, not to implement anything.

## Request
{user prompt or PRD contents}

## Project context
{contents of .mise/toc.md}
{contents of .mise/station.yaml}

## Current codebase
Read files as needed to understand the project structure.

## Instructions
1. Understand what's being requested.
2. Break the work into tasks that each fit within a single agent session.
   Each task should be completable by an agent that can read/write files
   and run commands, without needing to hold more than ~50 files in context.
3. For each task, specify:
   - A clear title
   - Acceptance criteria (testable conditions)
   - Assumptions (things you're assuming but aren't certain about)
   - Dependencies (which tasks must complete first)
   - Parallel safety (can this run alongside other tasks in the same group?)
   - Estimated size (small/medium/large)
   - Owned paths (files/dirs this task will primarily touch)
   - Required inputs (env vars, external services, credentials, migrations)
   - Blocking questions (only if required input is unknown)
4. Group tasks by execution order. Tasks in the same group with
   parallel_safe=true and non-overlapping owned_paths can run concurrently.
5. Mark "first move" tasks — scaffolding that unblocks everything else.
6. Target task scope near ~90% context utilization with a hard cap near ~95%.

{if mode == attended}
Before generating the plan, ask only blocking clarifying questions
(requirements that prevent correctness/safety/execution). List all
blocking questions, then wait for answers.
{/if}

Output the plan as YAML matching the board.yaml schema.
```

---

## 7. Failure Handling

### Backpressure failure (tests/lint/build fail)

1. Capture failure output to `.mise/logs/{task-id}/{command}.log`
2. Spawn a new agent session with the original task card PLUS the failure output
3. The fresh agent reads the failure, reads the code, and fixes it
4. Re-run backpressure
5. Repeat up to `--retries N` times
6. If still failing: mark task as `failed`, report to user, continue or stop based on config

### Engine unavailable or auth expired

1. Run `engine_check` during `mise init`, at loop start, and before each task spawn.
2. If Claude CLI is missing or auth fails, stop before task execution and mark affected ready tasks as `blocked` with reason `engine_unavailable` or `engine_auth`.
3. Surface actionable remediation (`claude login`, install path, token refresh).
4. Resume with `mise loop` after remediation; state is preserved.

### Merge conflict (parallel mode)

1. After parallel group completes, attempt merge
2. If conflicts: spawn a merge-resolution agent session
   - Receives: both diffs, the conflict markers, both task cards
   - Resolves conflicts with understanding of both tasks' intent
3. Run integration backpressure on merged result
4. If merge resolution fails: fall back to sequential re-execution of conflicting tasks

### Agent produces no useful output

1. Detect: no file changes after agent session exits
2. Retry once with an augmented prompt ("The previous attempt produced no changes. Read the acceptance criteria carefully and implement the required functionality.")
3. If still no output: mark task as `blocked`, surface to user

### Loop interrupted (laptop closed, shell crash, power loss)

1. `mise loop` acquires `.mise/run.lock` atomically and writes PID + started_at + heartbeat_at.
2. Heartbeat updates every `runtime.heartbeat_seconds` (default 10s).
3. Lock is stale if `now - heartbeat_at > runtime.lock_stale_after_seconds` (default 45s).
4. On startup with stale lock, orchestrator recovers automatically:
   - tasks stuck in `in_progress` with stale heartbeat return to `pending`
   - tasks already `complete` remain `complete`
5. If lock is active (not stale), a second `mise loop` exits with a clear "already running" message.
6. Re-running `mise loop` resumes from durable state; no separate resume command is required.

### Signal handling (Ctrl+C / SIGTERM)

1. Orchestrator traps `SIGINT`/`SIGTERM`.
2. Active agent subprocess receives forwarded signal and is allowed a short graceful shutdown window.
3. Current task is transitioned safely:
   - if committed + verified: keep terminal state
   - otherwise: set back to `pending` with interruption note
4. Append interruption record to `.mise/progress.log` and release `.mise/run.lock`.

### Task is impossible (86'd)

Agent can signal that a task is blocked on external factors:
- Missing API key or service
- Dependency on another task that was skipped
- Requirement is contradictory

The agent writes the reason to `.mise/status/{task-id}.yaml` with `status: blocked`. The orchestrator skips the task, records the reason, and notifies the user.

---

## 8. Token Efficiency

### Strategies

1. **Fresh context per iteration.** No accumulated conversation. The agent reads only what it needs from disk.

2. **Minimal prompt injection.** Only `toc.md` + task card are auto-injected. The agent reads `brief.md` and other docs on demand. Progressive disclosure — not everything upfront.

3. **Grep-friendly logs.** All command output goes to `.mise/logs/`. Only a summary line appears in the agent's context. The agent can grep log files if needed.

4. **Fast verification mode (Phase B).** `--fast` runs a deterministic subset of tests (tagged smoke tests or first N). Full suite runs on final integration or when explicitly requested.

5. **Model selection per role.** Planning can use a stronger/more expensive model (`--model opus`). Execution uses the default. Cleanup tasks can use a cheaper model.

6. **Small task scoping.** Tasks target ~90% of context window usage with a hard cap near ~95%. This maximizes context efficiency while preserving retry headroom.

7. **Brief as compaction.** Instead of server-side compaction, the brief is a human-readable summary updated after each iteration. It's ~50-150 lines — a fraction of what accumulated conversation would be.

### Cost tracking

The orchestrator tracks token usage per iteration (parsed from engine output) and maintains a running total:
```
.mise/progress.log:
[2024-01-15 14:23:01] scaffold-auth | complete | 2m14s | 12K in / 3K out | $0.12
[2024-01-15 14:28:15] setup-next-auth | complete | 3m08s | 18K in / 5K out | $0.18
```

With `--budget`, the orchestrator estimates the cost of the next task based on its size and the average cost of completed tasks, and stops if the estimate would exceed the remaining budget.

If token/cost parsing is unavailable for a run:
- Progress logs record token usage as `unknown` (not fabricated).
- Budget mode falls back to historical per-size averages when available.
- If no historical data exists, attended mode prompts for confirmation before continuing; autonomous mode stops with `budget_unavailable`.

---

## 9. Engine Interface

Mise v1 executes with Claude Code only. The codebase still uses a thin adapter shape so additional engines can be added later without reworking orchestration.

Each engine adapter implements three functions:

```bash
# Send a prompt and get a response (blocking)
engine_run(prompt, working_dir) -> exit_code

# Parse token usage from engine output
engine_parse_tokens(output) -> {input_tokens, output_tokens}

# Check if engine is available
engine_check() -> bool
```

`engine_check` is part of the control flow, not just an interface definition:
- Run during `mise init` preflight
- Run at `mise loop` startup
- Re-run before spawning each task/parallel batch
- Fail closed when unavailable/auth-expired (no task marked complete)

### v1 supported engine

| Engine | Invocation | Notes |
|---|---|---|
| `claude` | `claude -p "$prompt" --allowedTools ...` | Claude Code CLI. Default. |

Planned Phase B engines: codex, aider, custom. Adding a new engine means adding one adapter file with the three functions above. The orchestrator doesn't know or care what model is running — it only sees stdin/stdout/exit codes.

---

## 10. Implementation Roadmap

### Phase A — Minimal viable mise

Core bash loop with Claude Code execution, readiness gating, and dynamic safety-gated parallelism.

- `mise [prompt]` shorthand (`prep` + `loop`)
- `mise init` — project detection and config generation
- Deterministic `toc.md` generation + fingerprint-based drift refresh
- `mise prep` — planning via inline prompt or PRD file
- `mise run` — single task execution
- `mise loop` — idempotent, resumable loop through all tasks
- Dynamic scheduler (`--parallel auto`) with automatic sequential fallback
- Backpressure (test/lint/build) with retry
- `.mise/board.yaml`, `station.yaml`, `brief.md`, `progress.log`
- Deterministic `brief.md` regeneration with bounded size
- Readiness gate for required inputs (env vars/services) before execution
- Attended mode with blocking-only clarifying questions
- Completion evidence contract (`.mise/evidence/{task-id}.md`)
- Commit message/trailer enforcement + deterministic merge policy
- Lock/heartbeat + signal handling for safe interruption/recovery
- Autonomous mode flag
- Claude engine adapter
- Cost tracking in progress log

This gets the core loop working. Everything else builds on this.

### Phase B — Engine agnosticism and advanced scheduling

- Multi-engine adapters (codex, aider, custom)
- More advanced auto-parallel heuristics and conflict recovery
- `--fast` verification mode
- `--budget` cost limit
- `--dry-run` mode

### Phase C — Quality and observability

- `mise sweep` — entropy detection and cleanup task generation
- `--review` flag with reviewer agent pass
- `mise replan` — mid-execution plan regeneration
- `mise status` — board state dashboard
- Model selection per role (`--model`)
- GitHub issue input for `mise prep`
- Webhook/notification on completion or failure

### Phase D — Polish

- Interactive `mise prep` (no-args interview mode)
- Terminal UI improvements (progress bars, color, layout)
- Shell completions (bash, zsh, fish)
- Configuration profiles (per-project overrides)
- Plugin system for custom backpressure checks
- Documentation and examples

---

## 11. Design Constraints

These are deliberate limitations, not oversights.

1. **No AI orchestrator.** The bash script coordinates. AI agents execute tasks. Mixing coordination and execution in the same AI session causes behavioral degradation (Cursor's finding). The expediter doesn't cook.

2. **No persistent agent session state.** Every iteration starts fresh. No session continuations and no conversational memory. Execution checkpoints live on disk (`.mise/status`, `.mise/run.lock`) for crash-safe resume.

3. **No server component.** Mise is a CLI tool. It reads and writes local files. It shells out to AI engines. There is no server, no database, no API, no cloud dependency.

4. **No custom model fine-tuning.** Mise works with off-the-shelf models via their CLI interfaces. It doesn't require custom models, embeddings, or fine-tunes.

5. **No conversation UI.** Mise is not a chat interface. The only interactive elements are plan approval prompts and clarifying questions. The terminal shows progress, not conversation.

6. **Single repository scope.** Mise operates within one git repository. Cross-repo coordination is out of scope.

---

## 12. File Structure

```
mise/
  bin/
    mise                    # Main entry point
  lib/
    core/
      loop.sh               # Core execution loop
      board.sh               # Board (task queue) management
      brief.sh               # Brief generation and updates
      toc.sh                 # Deterministic TOC generation + drift detection
      readiness.sh           # Required-input checks before execution
      lock.sh                # run.lock, heartbeat, stale lock recovery
      signals.sh             # SIGINT/SIGTERM trapping and cleanup
      backpressure.sh        # Test/lint/build verification
      progress.sh            # Progress logging and cost tracking
    phases/
      init.sh                # Station setup / project detection
      prep.sh                # Planning phase
      service.sh             # Execution phase (adaptive scheduler)
      pass.sh                # Review phase
    engines/
      claude.sh              # Claude Code adapter
      # codex.sh             # Planned Phase B
      # aider.sh             # Planned Phase B
      # custom.sh            # Planned Phase B
    parallel/
      scheduler.sh           # Auto scheduler (sequential vs parallel)
      worktree.sh            # Git worktree management
      merge.sh               # Branch merging + conflict resolution
      dispatch.sh            # Parallel task dispatch
    prompts/
      task.md                # Task execution prompt template
      plan.md                # Planning prompt template
      review.md              # Reviewer prompt template
      merge.md               # Merge resolution prompt template
      clarify.md             # Clarification prompt template
    utils/
      detect.sh              # Project/language/framework detection
      config.sh              # Configuration loading
      output.sh              # Terminal output formatting
      git.sh                 # Git operations
  templates/
    station.yaml             # Default station config template
    board.yaml               # Default board template
    toc.md                   # Default table-of-contents template
    gitignore.mise           # Suggested .mise ignore template
  test/
    ...                      # Test suite
  LICENSE
  README.md
```

---

## 13. Naming and Metaphor Reference

The mise-en-place metaphor is used internally for clarity but the CLI surface stays practical. Users don't need to know kitchen terminology.

| Kitchen term | Mise concept | User-facing term |
|---|---|---|
| Station | Project workspace + config | "station" (in config only) |
| Mise en place | `mise init` | `init` |
| Prep | Planning phase | `prep` |
| Service | Execution loop | `loop` / `run` |
| The pass | Backpressure verification | "verification" or "checks" |
| Brigade | Parallel execution mode | "parallel" |
| Expediter | The bash orchestrator | (invisible — it's just the tool) |
| 86'd | Task skipped/blocked | "skipped" |
| First moves | Scaffolding tasks | "first moves" (in plan output) |
| Clean station | Fresh context per iteration | (invisible — it's the architecture) |
| Call and callback | Clarification protocol | "question" / "clarification" |
| Meeze point | Max task size for one context window | (invisible — enforced in planning) |
