import { z } from 'zod';

export const StationSchema = z.object({
  project: z
    .object({
      name: z.string(),
      language: z.string().optional(),
      framework: z.string().optional(),
      package_manager: z.string().optional(),
    })
    .default({ name: 'unnamed' }),
  backpressure: z
    .object({
      test: z.string().optional(),
      lint: z.string().optional(),
      build: z.string().optional(),
      typecheck: z.string().optional(),
    })
    .default({}),
  rules: z.array(z.string()).default([]),
  boundaries: z.array(z.string()).default([]),
  engine: z
    .object({
      name: z.enum(['claude']).default('claude'),
      model: z.string().default('sonnet'),
      max_budget_usd: z.number().optional(),
      allowed_tools: z.array(z.string()).default([]),
    })
    .default({}),
  mode: z
    .object({
      attended: z.boolean().default(true),
      parallel: z.union([z.literal('off'), z.literal('auto'), z.number()]).default('off'),
      max_parallel: z.number().default(4),
      max_retries: z.number().default(2),
      skip_failures: z.boolean().default(false),
    })
    .default({}),
  runtime: z
    .object({
      heartbeat_interval_ms: z.number().default(30000),
      stale_threshold_ms: z.number().default(120000),
    })
    .default({}),
});

export type Station = z.infer<typeof StationSchema>;
