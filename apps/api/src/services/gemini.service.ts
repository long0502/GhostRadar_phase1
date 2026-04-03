import * as fs from 'fs';
import { globalStats } from '../core/metrics';
import { recordAiUsageTokens } from './quota.service';
import { enqueueAiCall } from './ai-queue.service';
import { logAiCall } from './ai-logging.service';

type GeminiCallParams = {
  endpoint: 'scan' | 'expand' | 'normalization' | 'ai-health';
  prompt: string;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: any;
  temperature?: number;
  aiCallsThisRequest: number;
  beforeAttempt?: () => Promise<
    | void
    | {
      usageDate: string;
      clientIp: string;
    }
  >;
  usageContext?: {
    usageDate: string;
    clientIp: string;
  };
  tools?: any[];
  model?: string;
  maxOutputTokens?: number;
  systemInstruction?: string;
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
  thinkingConfig?: {
    thinkingBudget?: number;
  };
};

type GeminiCallResult = {
  text: string;
  modelVersion: string;
  totalTokenCount?: number;
};

export async function callGemini(params: GeminiCallParams): Promise<GeminiCallResult> {
  const {
    endpoint,
    prompt: originalPrompt,
    aiCallsThisRequest,
    beforeAttempt,
    usageContext,
    systemInstruction,
  } = params;

  const aiStartTime = Date.now();
  let resolvedUsageContext = usageContext;

  if (beforeAttempt) {
    const attemptUsageContext = await beforeAttempt();
    if (attemptUsageContext) {
      resolvedUsageContext = attemptUsageContext;
    }
  }

  const modelVersion = 'chatgpt-gateway';
  const API_BASE_URL = process.env.AI_GATEWAY_URL || 'http://192.241.143.6';

  let prompt = originalPrompt;
  if (systemInstruction) {
    prompt = `${systemInstruction}\n\n${originalPrompt}`;
  }

  console.log(`[GATEWAY_REQUEST] Submitting prompt to ${API_BASE_URL}/ask`);
  
  let askResponse: Response;
  try {
    askResponse = await fetch(`${API_BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, timeout: 90 }),
    });
  } catch (err: any) {
    logAiCall({
      endpoint,
      model: modelVersion,
      tokensInput: prompt.length,
      tokensOutput: 0,
      latencyMs: Date.now() - aiStartTime,
      success: false,
      errorMessage: `Gateway fetch error: ${err.message}`,
    });
    throw new Error(`Failed to connect to AI Gateway: ${err.message}`);
  }

  if (!askResponse.ok) {
    const errorBody = await askResponse.text();
    fs.appendFileSync('gemini_debug.log', `[GATEWAY_ERROR] ${askResponse.status} ${errorBody}\n`);
    logAiCall({
      endpoint,
      model: modelVersion,
      tokensInput: prompt.length,
      tokensOutput: 0,
      latencyMs: Date.now() - aiStartTime,
      success: false,
      errorMessage: `Status ${askResponse.status} - ${errorBody.slice(0, 200)}`,
    });
    throw new Error(`AI Gateway error: ${askResponse.status} - ${errorBody}`);
  }

  const askData = await askResponse.json() as any;
  if (askData.status === 'error') {
    throw new Error(`Gateway Error on submission: ${askData.error}`);
  }

  const jobId = askData.request_id;
  console.log(`[GATEWAY_JOB] Received Job ID: ${jobId}. Waiting for processing...`);

  const startTime = Date.now();
  const timeoutMs = parseInt(process.env.AI_POLL_TIMEOUT_MS || '70000', 10);
  const pollIntervalMs = parseInt(process.env.AI_POLL_INTERVAL_MS || '3000', 10);
  
  let finalData: string | null = null;
  let hasTimeout = false;

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      hasTimeout = true;
      break;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

    let statusRes: Response;
    try {
      statusRes = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
    } catch (err: any) {
      console.error(`[GATEWAY_POLL_ERROR] ${err.message}`);
      continue;
    }

    if (!statusRes.ok) {
      console.error(`[GATEWAY_POLL_ERROR] HTTP ${statusRes.status}`);
      continue;
    }

    const statusData = await statusRes.json() as any;
    const status = statusData.status;

    if (status === 'success') {
      finalData = statusData.data;
      break;
    } else if (status === 'error') {
      const errMessage = statusData.error || 'Unknown error during processing';
      logAiCall({
        endpoint,
        model: modelVersion,
        tokensInput: prompt.length,
        tokensOutput: 0,
        latencyMs: Date.now() - aiStartTime,
        success: false,
        errorMessage: errMessage,
      });
      throw new Error(`Job failed: ${errMessage}`);
    }

    console.log(`[GATEWAY_JOB] Job ${jobId} still processing (${Math.round((Date.now() - startTime)/1000)}s elapsed)...`);
  }

  if (hasTimeout || finalData === null) {
    logAiCall({
      endpoint,
      model: modelVersion,
      tokensInput: prompt.length,
      tokensOutput: 0,
      latencyMs: Date.now() - aiStartTime,
      success: false,
      errorMessage: 'Timeout waiting for ChatGPT answer',
    });
    throw new Error('Error: Timeout waiting for ChatGPT answer (Exceeded 30s)');
  }

  fs.appendFileSync('gemini_debug.log', `[GATEWAY_TEXT] ${finalData}\n---\n`);
  
  // Fake tokens since ChatGPT gateway doesn't provide token counts
  const totalTokenCount = Math.round(finalData.length / 4); 

  globalStats.total_ai_calls += 1;
  globalStats.total_tokens += totalTokenCount;
  
  if (resolvedUsageContext) {
    await recordAiUsageTokens({
      usageDate: resolvedUsageContext.usageDate,
      clientIp: resolvedUsageContext.clientIp,
      tokens: totalTokenCount,
    });
  }

  if (endpoint === 'scan') {
    globalStats.scan_ai_calls += 1;
  } else if (endpoint === 'expand') {
    globalStats.expand_ai_calls += 1;
  }

  console.log(`[AI_CALL] route=${endpoint} model=${modelVersion} timestamp=${new Date().toISOString()} totalTokenCount=${totalTokenCount}`);
  
  logAiCall({
    endpoint,
    model: modelVersion,
    tokensInput: prompt.length,
    tokensOutput: totalTokenCount,
    latencyMs: Date.now() - aiStartTime,
    success: true,
  });

  return {
    text: finalData,
    modelVersion,
    totalTokenCount,
  };
}

export async function callGeminiQueued(params: GeminiCallParams): Promise<GeminiCallResult> {
  return enqueueAiCall(() => callGemini(params));
}

export type GeminiImageResult = {
  imageBase64: string;
  mimeType: string;
  dataUrl: string;
} | null;

export async function callGeminiImageQueued(prompt: string): Promise<GeminiImageResult> {
  console.log('[GEMINI_IMAGE] Image generation is temporarily disabled per user settings.');
  return Promise.resolve(null);
}
