# IPC Protocol

The IPC system enables communication between workers and the dispatcher using sequence-numbered files in `.dispatch/tasks/<task-id>/ipc/`.

## Question/Answer Flow

Workers are spawned via the Agent tool. When a worker needs to ask a question, it writes the question to a file and exits. The dispatcher gets notified, asks the user, writes the answer, and spawns a new worker to continue.

1. Worker writes question to `ipc/001.question` (atomic write via temp file + `mv`)
2. Worker writes its context to `context.md` (so the next worker can continue)
3. Worker marks the plan item `[?]` with the question text and exits
4. Agent tool notification fires → dispatcher reads the question
5. Dispatcher surfaces the question to the user
6. User answers; dispatcher writes `ipc/001.answer` (atomic write)
7. Dispatcher spawns a new worker subagent with instructions to read `context.md` + the answer + continue

## File Naming

All files live in `.dispatch/tasks/<task-id>/ipc/`:

- `001.question` — Worker's question (plain text)
- `001.answer` — Dispatcher's answer (plain text)
- `.done` — Completion marker written by worker when all tasks finish
- Sequence numbers are zero-padded to 3 digits: `001`, `002`, `003`, etc.

## Atomic Write Pattern

All writes use a two-step pattern to prevent reading partial files:
1. Write to `<filename>.tmp`
2. `mv <filename>.tmp <filename>` (atomic on POSIX filesystems)

Both the worker (writing questions) and the dispatcher (writing answers) follow this pattern.

## Directionality

IPC is **worker-initiated**. The worker writes questions; the dispatcher writes answers to those questions. The dispatcher must never write unsolicited files to the IPC directory.

To provide additional context to a running worker, append notes to the plan file instead.

## Sequence Numbering

The next sequence number is derived from the count of existing `*.question` files in the IPC directory, plus one. The worker determines this when it needs to ask a question.

## Startup Reconciliation

If the dispatcher restarts mid-conversation, it should scan the IPC directory for unanswered questions on any active task:

1. List all task directories under `.dispatch/tasks/`.
2. For each, check `ipc/` for `*.question` files without matching `*.answer` files.
3. If found, surface the question to the user and resume the flow.

This ensures questions are never silently lost.
