import { z } from 'zod';

export const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  SKIPPED: 'skipped',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'complete',
  'failed',
  'blocked',
  'skipped',
]);

export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'blocked', 'skipped'],
  in_progress: ['complete', 'failed', 'blocked', 'pending'],
  complete: [],
  failed: ['pending'],
  blocked: ['pending', 'in_progress'],
  skipped: ['pending'],
};

export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export const StatusFileSchema = z.object({
  task_id: z.string(),
  status: TaskStatusSchema,
  updated_at: z.string(),
  run_id: z.string().optional(),
  attempt: z.number().optional(),
  error: z.string().optional(),
  note: z.string().optional(),
});

export type StatusFile = z.infer<typeof StatusFileSchema>;
