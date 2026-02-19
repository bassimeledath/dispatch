import { z } from 'zod';

export const TierSchema = z.enum(['quick', 's1', 's2']);
export type Tier = z.infer<typeof TierSchema>;

export const TaskStatusSchema = z.enum(['pending', 'running', 'waiting', 'complete', 'failed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  tier: TierSchema,
  model: z.string(),
  reviewerModel: z.string().nullable().default(null),
  engine: z.string().default('claude'),
  lintPassed: z.boolean().nullable().default(null),
  status: TaskStatusSchema,
  created: z.string(),
  updated: z.string(),
  pid: z.number().nullable(),
  worktree: z.string().nullable(),
  branch: z.string().nullable(),
  question: z.string().nullable(),
  answer: z.string().nullable(),
  pr: z.string().nullable(),
  commit: z.string().nullable(),
  error: z.string().nullable(),
  retries: z.number(),
});
export type Task = z.infer<typeof TaskSchema>;

export const StateSchema = z.object({
  version: z.literal(1),
  tasks: z.record(z.string(), TaskSchema),
});
export type State = z.infer<typeof StateSchema>;
