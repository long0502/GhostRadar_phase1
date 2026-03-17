/**
 * AI Logging Service — Fire-and-forget logging for Gemini API calls.
 * Writes to `ai_call_logs` table for future admin dashboard analytics.
 * Tracks per-call tokens, cost, latency, and success/failure.
 */
import { prisma } from '../db/prisma';

// Gemini 2.5 Flash Lite pricing estimate (per token)
// Input: ~$0.075/M tokens, Output: ~$0.30/M tokens
const INPUT_COST_PER_TOKEN = 0.000000075;
const OUTPUT_COST_PER_TOKEN = 0.0000003;

export type AiCallLogParams = {
  endpoint: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  eventId?: string;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
};

/**
 * Estimate the USD cost of a Gemini API call based on token counts.
 */
export function estimateGeminiCost(tokensInput: number, tokensOutput: number): number {
  return (tokensInput * INPUT_COST_PER_TOKEN) + (tokensOutput * OUTPUT_COST_PER_TOKEN);
}

/**
 * Log an AI call. Fire-and-forget — does NOT block the response.
 */
export function logAiCall(params: AiCallLogParams): void {
  const estimatedCost = estimateGeminiCost(params.tokensInput, params.tokensOutput);

  const insert = prisma.ai_call_logs.create({
    data: {
      endpoint: params.endpoint,
      model: params.model,
      tokens_input: params.tokensInput,
      tokens_output: params.tokensOutput,
      estimated_cost: estimatedCost,
      event_id: params.eventId,
      latency_ms: params.latencyMs,
      success: params.success,
      error_message: params.errorMessage,
    },
  });

  // Fire-and-forget: never block the request
  insert.catch((err: unknown) => {
    console.error('[AI_LOGGING] Failed to write ai_call_logs:', err instanceof Error ? err.message : err);
  });
}
