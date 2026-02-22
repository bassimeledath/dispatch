---
name: dispatch-feedback
description: "Log freeform feedback on dispatched tasks and optionally open a GitHub issue."
license: MIT
version: "2.0.0"
last_updated: "2026-02-20"
user_invocable: true
---

# Dispatch Feedback

The user invoked `/dispatch-feedback <freeform text>`. Your job: log it and optionally escalate to a GitHub issue.

## Step 1: Extract the Feedback

The entire argument string is the feedback. Examples:

- `/dispatch-feedback worked great`
- `/dispatch-feedback the worker missed the auth edge case`
- `/dispatch-feedback slow but got the job done`

If no text was provided, ask the user: "What feedback would you like to log?" Then use their response.

## Step 2: Log to JSONL

Append a single JSON line to `.dispatch/feedback/events.jsonl`.

1. Ensure the directory exists:
   ```bash
   mkdir -p .dispatch/feedback
   ```

2. Get field values:
   - **timestamp**: via `date -u +"%Y-%m-%dT%H:%M:%SZ"`
   - **feedback**: the raw text from the user
   - **project**: via `basename $(git rev-parse --show-toplevel 2>/dev/null || echo "unknown")`

3. **Safe write** — do NOT use `echo` with interpolated values. Instead:
   - Construct the JSON line: `{"timestamp":"...","feedback":"...","project":"..."}`
   - Use the **Write tool** to write it to `/tmp/dispatch-feedback-event.json`
   - Append via Bash: `cat /tmp/dispatch-feedback-event.json >> .dispatch/feedback/events.jsonl`

## Step 3: Offer GitHub Issue

Ask the user once using the **AskUserQuestion tool**:

> Want to open a GitHub issue with this feedback?

Options: **Yes** / **No**

If **No**, skip to Step 4.

If **Yes**:
1. Write the feedback text to `/tmp/dispatch-feedback-issue-body.md` using the **Write tool**.
2. Create the issue:
   ```bash
   gh label create "dispatch-feedback" --description "Feedback on dispatched tasks" --color "D93F0B" 2>/dev/null || true
   gh issue create --title "Dispatch feedback" --label "dispatch-feedback" --body-file /tmp/dispatch-feedback-issue-body.md
   ```
3. If `gh` is not available, tell the user and move on.

## Step 4: Report Back

- Always say: **"Feedback logged."**
- If a GitHub issue was created, include the issue URL.
