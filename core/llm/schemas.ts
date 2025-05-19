// backend/src/llm/schemas.ts
import { z } from 'zod';

export const RelevanceCheckResponseSchema = z.object({
	relevant: z.boolean(),
	confidence: z.number().optional(),
	reasoning: z.string(),
});

export type RelevanceCheckResponse = z.infer<typeof RelevanceCheckResponseSchema>;