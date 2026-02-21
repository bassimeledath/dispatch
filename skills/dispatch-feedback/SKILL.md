---
name: dispatch-feedback
description: "Provide feedback on dispatched tasks. Logs ratings, appends to plan files, and offers to create GitHub issues on negative feedback."
license: MIT
version: "1.0.0"
last_updated: "2026-02-20"
user_invocable: true
---

# Dispatch Feedback

You are handling a **feedback submission** for a dispatched task. The user invoked:

```
/dispatch-feedback <task-id> <rating> ["reason"]
```

Your job: parse the arguments, validate the task, record feedback, and escalate negative feedback to a GitHub issue.

## Step 1: Parse Arguments

Extract from the user's input:

- **task-id** (required) — the dispatch task identifier (e.g., `security-review`, `add-auth`)
- **rating** (required) — must be `+1` or `-1`
- **reason** (optional) — freeform text explaining the rating

### Argument formats to handle

| Input | task-id | rating | reason |
| --- | --- | --- | --- |
| `/dispatch-feedback security-review +1` | security-review | +1 | _(none)_ |
| `/dispatch-feedback security-review -1 "missed key requirement"` | security-review | -1 | missed key requirement |
| `/dispatch-feedback add-auth +1 "fast and accurate"` | add-auth | +1 | fast and accurate |
| `/dispatch-feedback security-review -1` | security-review | -1 | _(none)_ |

### Validation errors

- **Missing task-id or rating**: Tell the user the correct usage:
  `Usage: /dispatch-feedback <task-id> <rating> ["reason"]` where rating is `+1` or `-1`.
  Then stop.
- **Invalid task-id**: After extracting task-id, validate that it matches the pattern `^[a-z0-9][a-z0-9-]*$` — only lowercase letters, numbers, and hyphens, and must start with a letter or number. If it does not match (e.g., contains `/`, `..`, spaces, uppercase, or other special characters), tell the user:
  `Invalid task ID '<task-id>'. Task IDs must be kebab-case (lowercase letters, numbers, and hyphens only).`
  Then stop.
- **Invalid rating** (not `+1` or `-1`): Tell the user rating must be `+1` or `-1`. Then stop.

## Step 2: Validate the Task Exists

Check that the plan file exists:

```
.dispatch/tasks/<task-id>/plan.md
```

If it does not exist, tell the user: `No task found with ID '<task-id>'. Check .dispatch/tasks/ for available tasks.` Then stop.

## Step 3: Append Feedback to Plan File

Read `.dispatch/tasks/<task-id>/plan.md` and append a feedback section at the bottom:

```markdown

## Feedback
- **Rating:** +1
- **Reason:** <reason, or "none provided">
- **Timestamp:** <current ISO 8601 timestamp>
```

Use the Edit tool to append this section. If a `## Feedback` section already exists, **replace it** with the new feedback (a task gets one feedback entry).

## Step 4: Log Structured Event

Append a single JSON line to `.dispatch/feedback/events.jsonl` (create the directory and file if they don't exist).

First, ensure the directory exists via Bash:

```bash
mkdir -p .dispatch/feedback
```

Then gather field values:

- **timestamp**: Current time in ISO 8601 format. Get it via Bash: `date -u +"%Y-%m-%dT%H:%M:%SZ"`
- **task_id**: The task-id from the arguments.
- **agent**: Try to infer from the plan file content or the task context. If unknown, use `"unknown"`.
- **rating**: `"+1"` or `"-1"` as a string.
- **reason**: The user's reason, or `""` if none provided. **Escape any double quotes** inside the reason (replace `"` with `\"`).
- **project**: Get the repo name via Bash: `basename $(git rev-parse --show-toplevel 2>/dev/null || echo "unknown")`
- **source**: Always `"dispatch-feedback"`.

**IMPORTANT — safe write method:** Do NOT use Bash `echo` with interpolated values. User-provided text (especially `reason`) can contain quotes, backticks, or shell metacharacters that break quoting or allow injection.

Instead:

1. Construct the full JSON line as text.
2. Use the **Write tool** to write it to a temp file: `/tmp/dispatch-feedback-event.json`
3. Append it to the JSONL file via Bash:

```bash
cat /tmp/dispatch-feedback-event.json >> .dispatch/feedback/events.jsonl
```

The JSON line schema:

```json
{"timestamp":"<ISO 8601>","task_id":"<task-id>","agent":"<agent>","rating":"<+1 or -1>","reason":"<reason>","project":"<repo name>","source":"dispatch-feedback"}
```

## Step 5: Escalate Negative Feedback

**Only if rating is `-1`**, offer to create a GitHub issue.

### Check for prior escalation

Before prompting, check the `## Feedback` section in `.dispatch/tasks/<task-id>/plan.md` for an existing `**Issue:**` line containing a GitHub issue URL.

- If a previous issue URL is found, warn the user:
  `A previous issue was already created for this task: <url>. Create another? (Yes / No)`
- If no previous issue URL is found, ask:
  `Create a GitHub issue for this negative feedback? (Yes / No)`

Use the **AskUserQuestion tool** to present this question. **Do not create the issue without user confirmation.**

If the user declines, skip issue creation entirely and proceed to Step 6.

### Build the issue body

Only if the user confirmed:

1. Read `.dispatch/tasks/<task-id>/plan.md` and extract the checklist (the `- [x]` / `- [ ]` lines).
2. Check if `.dispatch/tasks/<task-id>/output.md` exists. If so, note its path.
3. Compose the body:

```markdown
## Dispatch Task Feedback

- **Task ID:** <task-id>
- **Rating:** -1
- **Reason:** <reason or "No reason provided">

### Plan Checklist
<paste the checklist lines from plan.md>

### Output
<if output.md exists: "See `.dispatch/tasks/<task-id>/output.md`">
<if output.md does not exist: "No output file generated.">
```

### Create the issue

**IMPORTANT — safe argument passing:** Do NOT pass `--body` with inline content. User-provided text and plan content can contain quotes, backticks, or shell metacharacters that break quoting or allow injection.

Instead:

1. Use the **Write tool** to write the composed body to `/tmp/dispatch-feedback-issue-body.md`.
2. Create the issue using `--body-file`:

```bash
gh issue create \
  --title "Dispatch feedback: <task-id> (-1)" \
  --label "dispatch-feedback" \
  --body-file /tmp/dispatch-feedback-issue-body.md
```

**If the label doesn't exist yet**, the `gh issue create` command may fail. In that case, create the label first:

```bash
gh label create "dispatch-feedback" --description "Negative feedback on dispatched tasks" --color "D93F0B" 2>/dev/null || true
```

Then retry the issue creation.

### Persist the issue URL

After successful issue creation:

1. Append `- **Issue:** <issue-url>` to the `## Feedback` section in `.dispatch/tasks/<task-id>/plan.md` using the Edit tool.
2. Log a follow-up JSONL event with the issue URL: construct a new JSON object with the same fields as the original event plus `"issue_url":"<url>"`. Use the **Write tool** to write it to `/tmp/dispatch-feedback-event.json`, then append via Bash:

```bash
cat /tmp/dispatch-feedback-event.json >> .dispatch/feedback/events.jsonl
```

This appends a second JSONL line for the same feedback event, enriched with the issue URL. Consumers should deduplicate by timestamp + task_id, taking the most complete record.

### If `gh` is not available

If `gh` is not installed or not authenticated, skip issue creation and tell the user:
`GitHub CLI (gh) not available — skipped issue creation. Feedback was still recorded in the plan file and events.jsonl.`

## Step 6: Report Back

Tell the user what happened:

- **Always**: "Feedback recorded for task `<task-id>`: `<rating>`"
- **If reason provided**: include the reason in the confirmation
- **If -1 and issue created**: "GitHub issue created: `<issue-url>`"
- **If -1 and issue creation failed**: mention the failure but confirm feedback was still logged

### Example outputs

**Positive feedback:**
```
Feedback recorded for task `security-review`: +1
```

**Negative feedback with issue:**
```
Feedback recorded for task `security-review`: -1 ("missed key requirement")
GitHub issue created: https://github.com/user/repo/issues/42
```

**Negative feedback, no gh:**
```
Feedback recorded for task `security-review`: -1 ("missed key requirement")
GitHub CLI (gh) not available — skipped issue creation.
```
