import { z } from 'zod';

export const normalizedSignalSchema = z.object({
  title: z.string(),
  summary: z.string(),
  lat: z.number(),
  lon: z.number(),
  event_type: z.string(),
  event_source: z.string(),
  confidence: z.number().min(0).max(1),
});

export const normalizedSignalArraySchema = z.array(normalizedSignalSchema);

export type NormalizedSignal = z.infer<typeof normalizedSignalSchema>;
