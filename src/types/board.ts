import { z } from 'zod';
import { TaskStatusSchema } from './status.js';

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  group: z.number().default(1),
  depends_on: z.array(z.string()).default([]),
  size: z.enum(['S', 'M', 'L', 'XL']).default('M'),
  parallel_safe: z.boolean().default(false),
  owned_paths: z.array(z.string()).default([]),
  acceptance_criteria: z.array(z.string()).default([]),
  required_inputs: z
    .object({
      env_vars: z.array(z.string()).default([]),
      services: z.array(z.string()).default([]),
      credentials: z.array(z.string()).default([]),
      migrations: z.array(z.string()).default([]),
    })
    .default({}),
  blocking_questions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  status: TaskStatusSchema.default('pending'),
});

export type Task = z.infer<typeof TaskSchema>;

export const BoardSchema = z.object({
  version: z.number().default(1),
  project: z.string().optional(),
  tasks: z.array(TaskSchema),
});

export type Board = z.infer<typeof BoardSchema>;
