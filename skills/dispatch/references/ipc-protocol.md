## IPC Protocol Specification

The IPC system uses sequence-numbered files in `.dispatch/tasks/<task-id>/ipc/` for communication between the worker and dispatcher.

### Flow

IPC is **worker-initiated**. The worker writes a question and exits; the dispatcher writes the answer and spawns a new worker to continue.

1. Worker encounters a question → writes `<NNN>.question` file (atomic write)
2. Worker writes `context.md` with its current state and progress
3. Worker marks the plan item `[?]` with the question text and stops
4. Agent tool notification fires → dispatcher reads the question
5. Dispatcher asks the user, then writes `<NNN>.answer` file (atomic write)
6. Dispatcher spawns a new worker subagent with instructions to read `context.md` + the answer

### File naming

- `001.question` — Worker's question (plain text)
- `001.answer` — Dispatcher's answer (plain text)
- `.done` — Completion marker written by worker when all checklist items are done
- Sequence numbers are zero-padded to 3 digits: `001`, `002`, `003`, etc.

### Atomic write pattern

All writes use a two-step pattern to prevent reading partial files:
1. Write to `<filename>.tmp`
2. `mv <filename>.tmp <filename>` (atomic on POSIX filesystems)

Both the worker (writing questions) and the dispatcher (writing answers) follow this pattern.

### Sequence numbering

The next sequence number is derived from the count of existing `*.question` files in the IPC directory, plus one. The worker determines this when it needs to ask a question.

### Startup reconciliation

If the dispatcher restarts mid-conversation (e.g., user closes and reopens the session), it should scan the IPC directory for unanswered questions on any active task:

1. List all task directories under `.dispatch/tasks/`.
2. Skip any directory where `ipc/.done` exists (task already completed).
3. For remaining tasks, check `ipc/` for `*.question` files without matching `*.answer` files.
4. If found, surface the question to the user and resume the flow from step 4 onward.

This ensures questions are never silently lost.
