# IPC Protocol

The IPC system enables bidirectional communication between workers and the dispatcher without the worker losing context.

## Monitor-Based IPC

A lightweight monitor script (bash description: "Monitoring progress: \<task-id\>") polls the IPC directory for unanswered questions and a `.done` completion marker:

- When it finds an unanswered question → exits, triggering a `<task-notification>` that alerts the dispatcher.
- When it finds `.done` → exits cleanly.

This lets workers ask questions without exiting, preserving their full in-memory context. Falls back to `[?]` + `context.md` on timeout.

## Question/Answer Flow

1. Worker writes question to `ipc/001.question` (atomic write via temp file + `mv`)
2. Monitor detects the unanswered question and exits → triggers `<task-notification>`
3. Dispatcher reads the question, surfaces it to the user
4. User answers; dispatcher writes `ipc/001.answer` (atomic write)
5. Dispatcher respawns the monitor
6. Worker detects the answer, writes `001.done`, and continues working

If no answer arrives within ~3 minutes, the worker falls back: dumps context to `context.md`, marks the item `[?]` with the question, and exits.

## File Naming

All files live in `.dispatch/tasks/<task-id>/ipc/`:

- `001.question` — Worker's question (plain text)
- `001.answer` — Dispatcher's answer (plain text)
- `001.done` — Acknowledgment from worker that it received the answer
- `.done` — Completion marker written by worker when all tasks finish
- Sequence numbers are zero-padded to 3 digits: `001`, `002`, `003`, etc.

## Atomic Write Pattern

All writes use a two-step pattern to prevent reading partial files:
1. Write to `<filename>.tmp`
2. `mv <filename>.tmp <filename>` (atomic on POSIX filesystems)

Both the worker (writing questions) and the dispatcher (writing answers) follow this pattern.

## Directionality

IPC is **worker-initiated only**. The worker writes questions; the dispatcher writes answers to those questions. The dispatcher must never write unsolicited files to the IPC directory — the worker will not detect or process them.

To provide additional context to a running worker, append notes to the plan file instead.

## Sequence Numbering

The next sequence number is derived from the count of existing `*.question` files in the IPC directory, plus one. The worker determines this when it needs to ask a question.

## Startup Reconciliation

If the dispatcher restarts mid-conversation, it should scan the IPC directory for unanswered questions on any active task:

1. List all task directories under `.dispatch/tasks/`.
2. For each, check `ipc/` for `*.question` files without matching `*.answer` files.
3. If found, surface the question to the user and resume the IPC flow.

This ensures questions are never silently lost.
